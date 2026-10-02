// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/extensions/api/redrob_private/redrob_private_engine_installer.h"

#include <string_view>
#include <utility>
#include <vector>

#include "base/containers/span.h"
#include "base/cpu.h"
#include "base/files/file.h"
#include "base/files/file_path.h"
#include "base/files/file_util.h"
#include "base/files/scoped_temp_dir.h"
#include "base/functional/bind.h"
#include "base/functional/callback_helpers.h"
#include "base/json/json_reader.h"
#include "base/logging.h"
#include "base/path_service.h"
#include "base/strings/strcat.h"
#include "base/strings/string_number_conversions.h"
#include "base/strings/string_split.h"
#include "base/strings/string_util.h"
#include "base/task/thread_pool.h"
#include "base/values.h"
#include "build/build_config.h"
#include "components/services/unzip/content/unzip_service.h"
#include "components/services/unzip/public/cpp/unzip.h"
#include "components/services/unzip/public/mojom/unzipper.mojom.h"
#include "content/public/browser/browser_context.h"
#include "content/public/browser/storage_partition.h"
#include "crypto/hash.h"
#include "extensions/browser/event_router.h"
#include "net/base/load_flags.h"
#include "net/traffic_annotation/network_traffic_annotation.h"
#include "services/network/public/cpp/resource_request.h"
#include "services/network/public/cpp/shared_url_loader_factory.h"
#include "services/network/public/cpp/simple_url_loader.h"
#include "services/network/public/mojom/url_response_head.mojom.h"
#include "url/gurl.h"

namespace extensions {

namespace redrob_private = api::redrob_private;

namespace {

// The engine's repository. Pinned here rather than read from a pref: a
// preference that chooses where an executable is downloaded from is a
// configuration knob for an attacker.
constexpr char kLatestReleaseUrl[] =
    "https://api.github.com/repos/redrob-labs/redrob-code/releases/latest";

// Release assets are served from this host, and the tag is substituted in.
constexpr char kAssetUrlPattern[] =
    "https://github.com/redrob-labs/redrob-code/releases/download/$1/$2";

// The hash manifest the release publishes beside its archives. One line per
// asset, "<64 hex chars>  <file name>".
constexpr char kSumsFileName[] = "SHA256SUMS";

// Bounds on the two in-memory bodies. The release JSON is tens of kilobytes and
// SHA256SUMS is under two; these caps are generous and still refuse a body that
// is trying to be a heap.
constexpr size_t kMaxReleaseJsonBytes = 2u * 1024 * 1024;
constexpr size_t kMaxSumsBytes = 256u * 1024;

// The archive is around 50 MB compressed today. The cap is what a wrong URL
// serving something enormous runs into.
constexpr int64_t kMaxArchiveBytes = 512ll * 1024 * 1024;

// The file name inside the archive, and the name it is installed under. Both
// come from the engine's own installer, which moves `redrob` out of the archive
// root.
#if BUILDFLAG(IS_WIN)
constexpr base::FilePath::CharType kEngineFileName[] =
    FILE_PATH_LITERAL("redrob.exe");
#else
constexpr base::FilePath::CharType kEngineFileName[] =
    FILE_PATH_LITERAL("redrob");
#endif

// Where the engine installs itself, and the first place
// SidecarClient::FindEngineBinary looks after its environment override. Writing
// anywhere else would install an engine the browser cannot then find, which is
// the one failure mode a person cannot diagnose.
std::optional<base::FilePath> InstallDir() {
  base::FilePath home;
  if (!base::PathService::Get(base::DIR_HOME, &home)) {
    return std::nullopt;
  }
  return home.Append(FILE_PATH_LITERAL(".redrob"))
      .Append(FILE_PATH_LITERAL("bin"));
}

std::optional<base::FilePath> InstalledEnginePath() {
  std::optional<base::FilePath> dir = InstallDir();
  if (!dir.has_value()) {
    return std::nullopt;
  }
  return dir->Append(kEngineFileName);
}

bool EngineIsOnDisk() {
  std::optional<base::FilePath> path = InstalledEnginePath();
  return path.has_value() && base::PathExists(*path);
}

// The expected hash for `asset`, read out of a SHA256SUMS body.
//
// Parsed line by line and compared on the whole field, not with a substring
// search: "redrob-linux-x64.zip" is a substring of
// "redrob-linux-x64-musl.zip", so a find() on the body would happily return the
// musl hash for a glibc machine and the download would then fail its check for
// a reason nobody could read.
std::optional<std::string> ExpectedHashFor(std::string_view sums,
                                           std::string_view asset) {
  for (std::string_view line : base::SplitStringPiece(
           sums, "\n", base::TRIM_WHITESPACE, base::SPLIT_WANT_NONEMPTY)) {
    std::vector<std::string_view> fields = base::SplitStringPiece(
        line, " \t", base::TRIM_WHITESPACE, base::SPLIT_WANT_NONEMPTY);
    if (fields.size() != 2u) {
      continue;
    }
    if (fields[1] == asset && fields[0].size() == 64u) {
      return std::string(base::ToLowerASCII(fields[0]));
    }
  }
  return std::nullopt;
}

// Reads `file` in chunks and returns its SHA-256 as lowercase hex.
//
// Chunked rather than ReadFileToString because the archive is ~50 MB and this
// runs in the browser process; holding the whole thing to hash it doubles the
// peak for no reason.
std::string HashFileHex(const base::FilePath& file) {
  base::File input(file, base::File::FLAG_OPEN | base::File::FLAG_READ);
  if (!input.IsValid()) {
    return std::string();
  }
  crypto::hash::Hasher hasher(crypto::hash::kSha256);
  std::vector<uint8_t> buffer(64u * 1024);
  while (true) {
    std::optional<size_t> read = input.ReadAtCurrentPosNoBestEffort(buffer);
    if (!read.has_value()) {
      return std::string();
    }
    if (*read == 0u) {
      break;
    }
    hasher.Update(base::span(buffer).first(*read));
  }
  std::array<uint8_t, crypto::hash::kSha256Size> digest;
  hasher.Finish(digest);
  return base::ToLowerASCII(base::HexEncode(digest));
}

// Moves the extracted binary into the install directory and marks it
// executable.
//
// The executable bit is the step that cannot be skipped and cannot be done by
// the extension: a file copied without it is present, discoverable, and
// unlaunchable, which presents to the user as "installed but the agent still
// does not work".
bool MoveIntoPlace(const base::FilePath& extracted) {
  std::optional<base::FilePath> dir = InstallDir();
  if (!dir.has_value()) {
    return false;
  }
  if (!base::CreateDirectory(*dir)) {
    return false;
  }
  base::FilePath target = dir->Append(kEngineFileName);
  // Replace rather than refuse: this path is also how a stale engine is
  // upgraded, and a move that fails because the old one is in the way would
  // make reinstalling impossible.
  if (!base::ReplaceFile(extracted, target, nullptr) &&
      !base::CopyFile(extracted, target)) {
    return false;
  }
#if !BUILDFLAG(IS_WIN)
  if (!base::SetPosixFilePermissions(target, 0755)) {
    return false;
  }
#endif
  return true;
}

// Two annotations rather than one: the metadata fetches and the archive
// download are different requests with different payload sizes, and the
// annotation is the audit trail for each. They are file-scope constants because
// DefineNetworkTrafficAnnotation only evaluates in a constexpr context -- built
// inline at the call site it does not compile.
constexpr net::NetworkTrafficAnnotationTag kMetadataAnnotation =
    net::DefineNetworkTrafficAnnotation("redrob_engine_install_metadata", R"(
        semantics {
          sender: "Redrob engine installer"
          description:
            "Asks the engine's release host which release is current and what "
            "the published hash of this platform's archive is, so onboarding "
            "can install the local engine the agent needs."
          trigger:
            "The user asks onboarding, or the settings page, to install the "
            "engine."
          data: "None. A plain GET with no credentials."
          destination: WEBSITE
        }
        policy {
          cookies_allowed: NO
          setting:
            "Not sent unless the user asks for the engine to be installed."
          policy_exception_justification: "Not implemented."
        })");

constexpr net::NetworkTrafficAnnotationTag kArchiveAnnotation =
    net::DefineNetworkTrafficAnnotation("redrob_engine_install_archive", R"(
        semantics {
          sender: "Redrob engine installer"
          description:
            "Downloads the local engine's release archive for this platform. "
            "The archive is checked against the hash the release publishes "
            "before anything is installed."
          trigger:
            "The user asks onboarding, or the settings page, to install the "
            "engine."
          data: "None. A plain GET with no credentials."
          destination: WEBSITE
        }
        policy {
          cookies_allowed: NO
          setting:
            "Not sent unless the user asks for the engine to be installed."
          policy_exception_justification: "Not implemented."
        })");

}  // namespace

// One install, from the first request to the binary landing. Held by the
// installer so GetState() can report mid-run without the state being threaded
// through every callback.
struct RedrobPrivateEngineInstaller::Run {
  redrob_private::EngineInstallState state =
      redrob_private::EngineInstallState::kResolving;
  std::string version;
  std::string archive_name;
  std::string expected_hash;
  std::optional<int> percent;
  // Total body size from the response headers, used only to turn bytes received
  // into a percentage. Absent when the server did not say, in which case no
  // percentage is reported rather than a made-up one.
  std::optional<int64_t> total_bytes;
  base::FilePath archive;
  std::unique_ptr<base::ScopedTempDir> extract_dir;
};

std::string RedrobPrivateEngineInstaller::ArchiveNameForThisPlatform() {
  // The names mirror the engine's own installer exactly, including the two
  // variant suffixes, because a name this side invents is a 404 at install
  // time rather than a compile error here.
#if BUILDFLAG(IS_WIN)
  const char* os = "windows";
#elif BUILDFLAG(IS_MAC)
  const char* os = "darwin";
#else
  const char* os = "linux";
#endif

#if defined(ARCH_CPU_ARM64)
  const char* arch = "arm64";
#else
  const char* arch = "x64";
#endif

  std::string target = base::StrCat({os, "-", arch});

#if defined(ARCH_CPU_X86_64)
  // The engine's default x64 build requires AVX2; the `-baseline` build is the
  // one for machines without it. Picking wrong here does not fail the install,
  // it produces an engine that dies on its first instruction, so this is
  // measured rather than assumed.
  if (!base::CPU().has_avx2()) {
    target += "-baseline";
  }
#endif

#if BUILDFLAG(IS_LINUX)
  // musl systems need the musl build; glibc's loader is not there to run the
  // default one. Detected by the loader's own path, which is what distinguishes
  // the two at runtime.
  if (base::PathExists(base::FilePath(FILE_PATH_LITERAL(
          "/lib/ld-musl-x86_64.so.1"))) ||
      base::PathExists(
          base::FilePath(FILE_PATH_LITERAL("/lib/ld-musl-aarch64.so.1")))) {
    target += "-musl";
  }
#endif

  return base::StrCat({"redrob-", target, ".zip"});
}

RedrobPrivateEngineInstaller::RedrobPrivateEngineInstaller(
    content::BrowserContext* context)
    : context_(context) {}

RedrobPrivateEngineInstaller::~RedrobPrivateEngineInstaller() = default;

void RedrobPrivateEngineInstaller::GetState(StateCallback callback) {
  if (run_) {
    redrob_private::EngineInstallInfo info;
    info.state = run_->state;
    if (run_->percent.has_value()) {
      info.percent = *run_->percent;
    }
    if (!run_->version.empty()) {
      info.version = run_->version;
    }
    std::move(callback).Run(std::move(info));
    return;
  }
  // No run in flight, so the answer is whatever is on disk. That check blocks,
  // which is why this function is asynchronous for a question that looks
  // instant.
  base::ThreadPool::PostTaskAndReplyWithResult(
      FROM_HERE, {base::MayBlock()}, base::BindOnce(&EngineIsOnDisk),
      base::BindOnce(
          [](StateCallback done, bool present) {
            redrob_private::EngineInstallInfo info;
            info.state = present
                             ? redrob_private::EngineInstallState::kInstalled
                             : redrob_private::EngineInstallState::kNotInstalled;
            std::move(done).Run(std::move(info));
          },
          std::move(callback)));
}

void RedrobPrivateEngineInstaller::Install() {
  if (run_) {
    // Already running. Ignored rather than restarted: a second click on a
    // button that has not yet changed its label should not throw away a
    // download that is half done.
    return;
  }
  run_ = std::make_unique<Run>();
  run_->archive_name = ArchiveNameForThisPlatform();
  Broadcast();

  FetchString(GURL(kLatestReleaseUrl),
              base::BindOnce(&RedrobPrivateEngineInstaller::OnReleaseResolved,
                             weak_factory_.GetWeakPtr()));
}

void RedrobPrivateEngineInstaller::FetchString(
    const GURL& url,
    base::OnceCallback<void(std::optional<std::string>)> done) {
  auto request = std::make_unique<network::ResourceRequest>();
  request->url = url;
  request->method = "GET";
  // No cookies and no cached answer. The cache is worth avoiding because a
  // stale SHA256SUMS against a fresh archive looks exactly like tampering.
  request->credentials_mode = network::mojom::CredentialsMode::kOmit;
  request->load_flags = net::LOAD_DISABLE_CACHE;

  loader_ = network::SimpleURLLoader::Create(std::move(request),
                                            kMetadataAnnotation);
  loader_->SetRetryOptions(
      2, network::SimpleURLLoader::RETRY_ON_NETWORK_CHANGE);
  loader_->DownloadToString(
      context_->GetDefaultStoragePartition()
          ->GetURLLoaderFactoryForBrowserProcess()
          .get(),
      std::move(done),
      base::EndsWith(url.path(), kSumsFileName) ? kMaxSumsBytes
                                                : kMaxReleaseJsonBytes);
}

void RedrobPrivateEngineInstaller::OnReleaseResolved(
    std::optional<std::string> body) {
  if (!run_) {
    return;
  }
  if (!body.has_value()) {
    Fail("Could not reach the engine's release host. Check the connection and try again.");
    return;
  }
  std::optional<base::Value> parsed =
      base::JSONReader::Read(*body, base::JSON_PARSE_RFC);
  const std::string* tag = parsed && parsed->is_dict()
                               ? parsed->GetDict().FindString("tag_name")
                               : nullptr;
  if (!tag || tag->empty()) {
    Fail("The release host answered something this browser could not read.");
    return;
  }
  run_->version = *tag;
  run_->state = redrob_private::EngineInstallState::kResolving;
  Broadcast();

  FetchString(
      GURL(base::ReplaceStringPlaceholders(
          kAssetUrlPattern, {run_->version, kSumsFileName}, nullptr)),
      base::BindOnce(&RedrobPrivateEngineInstaller::OnSumsFetched,
                     weak_factory_.GetWeakPtr()));
}

void RedrobPrivateEngineInstaller::OnSumsFetched(
    std::optional<std::string> body) {
  if (!run_) {
    return;
  }
  if (!body.has_value()) {
    Fail("Could not read the release's published hashes, so the download could not be checked.");
    return;
  }
  std::optional<std::string> expected =
      ExpectedHashFor(*body, run_->archive_name);
  if (!expected.has_value()) {
    // This is the honest failure for a platform the release does not carry an
    // archive for. Refusing here is the point: the alternative is downloading
    // an archive for a different machine.
    Fail(base::StrCat({"This release has no build for this computer (",
                       run_->archive_name, ")."}));
    return;
  }
  run_->expected_hash = *expected;
  run_->state = redrob_private::EngineInstallState::kDownloading;
  run_->percent = 0;
  Broadcast();

  auto request = std::make_unique<network::ResourceRequest>();
  request->url = GURL(base::ReplaceStringPlaceholders(
      kAssetUrlPattern, {run_->version, run_->archive_name}, nullptr));
  request->method = "GET";
  request->credentials_mode = network::mojom::CredentialsMode::kOmit;

  loader_ = network::SimpleURLLoader::Create(std::move(request),
                                            kArchiveAnnotation);
  loader_->SetOnDownloadProgressCallback(
      base::BindRepeating(&RedrobPrivateEngineInstaller::OnDownloadProgress,
                          weak_factory_.GetWeakPtr()));
  loader_->DownloadToTempFile(
      context_->GetDefaultStoragePartition()
          ->GetURLLoaderFactoryForBrowserProcess()
          .get(),
      base::BindOnce(&RedrobPrivateEngineInstaller::OnArchiveDownloaded,
                     weak_factory_.GetWeakPtr()),
      kMaxArchiveBytes);
}

void RedrobPrivateEngineInstaller::OnDownloadProgress(uint64_t received) {
  if (!run_ ||
      run_->state != redrob_private::EngineInstallState::kDownloading) {
    return;
  }
  if (!run_->total_bytes.has_value() && loader_ && loader_->ResponseInfo()) {
    int64_t length = loader_->ResponseInfo()->content_length;
    if (length > 0) {
      run_->total_bytes = length;
    }
  }
  if (!run_->total_bytes.has_value()) {
    // No Content-Length. The state stays `downloading` with no percentage,
    // which an indeterminate bar can render honestly; inventing one would make
    // a stalled download look like a moving one.
    return;
  }
  int next = static_cast<int>((received * 100u) /
                              static_cast<uint64_t>(*run_->total_bytes));
  next = std::min(next, 100);
  // Only broadcast when the integer percentage actually moves. The progress
  // callback fires per network read, which on a 50 MB archive is thousands of
  // events, and every one of them would otherwise wake every listening page.
  if (run_->percent.has_value() && *run_->percent == next) {
    return;
  }
  run_->percent = next;
  Broadcast();
}

void RedrobPrivateEngineInstaller::OnArchiveDownloaded(base::FilePath archive) {
  if (!run_) {
    return;
  }
  if (archive.empty()) {
    Fail("The download did not finish. Check the connection and try again.");
    return;
  }
  run_->archive = archive;
  run_->state = redrob_private::EngineInstallState::kVerifying;
  run_->percent = std::nullopt;
  Broadcast();

  base::ThreadPool::PostTaskAndReplyWithResult(
      FROM_HERE, {base::MayBlock()},
      base::BindOnce(
          [](base::FilePath file, std::string expected) {
            return HashFileHex(file) == expected;
          },
          archive, run_->expected_hash),
      base::BindOnce(&RedrobPrivateEngineInstaller::OnHashChecked,
                     weak_factory_.GetWeakPtr()));
}

void RedrobPrivateEngineInstaller::OnHashChecked(bool matched) {
  if (!run_) {
    return;
  }
  if (!matched) {
    // Nothing is installed and the archive is left to its temp-file cleanup.
    // This is the branch the engine's own shell installer does not have.
    Fail("The downloaded file did not match the hash the release publishes, so it was not installed.");
    return;
  }
  run_->state = redrob_private::EngineInstallState::kExtracting;
  Broadcast();

  run_->extract_dir = std::make_unique<base::ScopedTempDir>();
  if (!run_->extract_dir->CreateUniqueTempDir()) {
    Fail("Could not make a temporary folder to unpack into.");
    return;
  }

  // The sandboxed unzip service, not an in-process unzip: the archive is
  // untrusted input that just arrived over the network, and this is the process
  // that must not parse it.
  unzip::Unzip(unzip::LaunchUnzipper(), run_->archive,
               run_->extract_dir->GetPath(), unzip::mojom::UnzipOptions::New(),
               unzip::AllContents(), base::DoNothing(),
               base::BindOnce(&RedrobPrivateEngineInstaller::OnUnzipped,
                              weak_factory_.GetWeakPtr()));
}

void RedrobPrivateEngineInstaller::OnUnzipped(bool ok) {
  if (!run_) {
    return;
  }
  if (!ok) {
    Fail("The downloaded archive could not be unpacked.");
    return;
  }
  base::FilePath extracted =
      run_->extract_dir->GetPath().Append(kEngineFileName);
  base::ThreadPool::PostTaskAndReplyWithResult(
      FROM_HERE, {base::MayBlock()},
      base::BindOnce(
          [](base::FilePath from) {
            if (!base::PathExists(from)) {
              return false;
            }
            return MoveIntoPlace(from);
          },
          extracted),
      base::BindOnce(&RedrobPrivateEngineInstaller::OnMoved,
                     weak_factory_.GetWeakPtr()));
}

void RedrobPrivateEngineInstaller::OnMoved(bool ok) {
  if (!run_) {
    return;
  }
  if (!ok) {
    Fail("The engine could not be put into place. Check that the home folder is writable.");
    return;
  }
  run_->state = redrob_private::EngineInstallState::kInstalled;
  run_->percent = std::nullopt;
  Broadcast();
  // The run is kept, not cleared, so GetState() keeps reporting the version
  // that was just installed rather than falling back to a bare "installed".
  run_->extract_dir.reset();
  loader_.reset();
}

void RedrobPrivateEngineInstaller::Fail(const std::string& reason) {
  if (!run_) {
    return;
  }
  run_->state = redrob_private::EngineInstallState::kFailed;
  run_->percent = std::nullopt;
  loader_.reset();
  run_->extract_dir.reset();

  redrob_private::EngineInstallInfo info;
  info.state = run_->state;
  if (!run_->version.empty()) {
    info.version = run_->version;
  }
  info.error = reason;
  EventRouter* event_router = EventRouter::Get(context_);
  if (event_router) {
    event_router->BroadcastEvent(std::make_unique<Event>(
        events::REDROBPRIVATE_ON_ENGINE_INSTALL_STATE_CHANGED,
        redrob_private::OnEngineInstallStateChanged::kEventName,
        redrob_private::OnEngineInstallStateChanged::Create(info), context_));
  }
  // Cleared on failure so the next Install() is a fresh run rather than being
  // ignored as "already running". GetState() then answers from disk again,
  // which is correct: after a failure the truth is whatever is installed.
  run_.reset();
}

void RedrobPrivateEngineInstaller::Broadcast() {
  if (!run_) {
    return;
  }
  EventRouter* event_router = EventRouter::Get(context_);
  if (!event_router) {
    return;
  }
  redrob_private::EngineInstallInfo info;
  info.state = run_->state;
  if (run_->percent.has_value()) {
    info.percent = *run_->percent;
  }
  if (!run_->version.empty()) {
    info.version = run_->version;
  }
  event_router->BroadcastEvent(std::make_unique<Event>(
      events::REDROBPRIVATE_ON_ENGINE_INSTALL_STATE_CHANGED,
      redrob_private::OnEngineInstallStateChanged::kEventName,
      redrob_private::OnEngineInstallStateChanged::Create(info), context_));
}

}  // namespace extensions
