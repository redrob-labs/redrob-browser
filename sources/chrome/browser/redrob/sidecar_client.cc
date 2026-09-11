// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/redrob/sidecar_client.h"

#include <utility>

#include "base/base64.h"
#include "base/containers/span.h"
#include "base/environment.h"
#include "base/files/file.h"
#include "base/files/file_util.h"
#include "base/functional/bind.h"
#include "base/logging.h"
#include "base/process/launch.h"
#include "base/threading/platform_thread.h"
#include "base/rand_util.h"
#include "base/strings/strcat.h"
#include "base/strings/string_number_conversions.h"
#include "base/strings/string_util.h"
#include "base/strings/utf_string_conversions.h"
#include "base/task/sequenced_task_runner.h"
#include "base/task/thread_pool.h"
#include "build/build_config.h"
#include "net/http/http_status_code.h"
#include "net/traffic_annotation/network_traffic_annotation.h"
#include "services/network/public/cpp/resource_request.h"
#include "services/network/public/cpp/simple_url_loader.h"
#include "services/network/public/mojom/url_response_head.mojom.h"
#include "url/gurl.h"

namespace redrob {
namespace {

// The environment variable a development build points at a locally built engine. Office and Work use
// the same name, so one checkout serves all three.
constexpr char kEngineBinaryEnvVar[] = "REDROB_CODE_BIN";
// Passed through to the child, never read into this process's memory beyond the handoff.
constexpr char kApiKeyEnvVar[] = "REDROB_API_KEY";

// The engine's own startup contract: `redrob serve` prints this once its listener is bound.
constexpr std::string_view kStartupPrefix = "redrob server listening on ";
constexpr char kHealthPath[] = "/global/health";

// Bounds on the handshake. The startup line arrives in milliseconds when it arrives at all, so a long
// wait means something is wrong rather than slow; the health poll is short because it is loopback.
constexpr base::TimeDelta kStartupLineTimeout = base::Seconds(20);
constexpr base::TimeDelta kHealthRetryDelay = base::Milliseconds(250);
constexpr int kMaxHealthAttempts = 40;  // 10s of loopback polling.
// A startup line longer than this is not a startup line. Bounded because the child controls this
// stream and an unbounded read on a misbehaving process is a memory bug waiting to happen.
constexpr size_t kMaxStartupBytes = 8 * 1024;

// Credentials are 32 random bytes, base64'd. They exist to stop anything else on loopback from driving
// the engine; they are not a user secret and are regenerated on every launch.
std::string GenerateBasicCredentials() {
  return base::Base64Encode(base::RandBytesAsVector(32));
}

// `base::EnvironmentMap` is keyed by the platform's native string type -- std::string on POSIX,
// std::wstring on Windows -- and there is no ready-made converter, so this fork carries a small one
// rather than a #if at every call site.
base::NativeEnvironmentString ToNative(std::string_view value) {
#if BUILDFLAG(IS_WIN)
  return base::UTF8ToWide(value);
#else
  return base::NativeEnvironmentString(value);
#endif
}

}  // namespace

// What the blocking launch task hands back. The process handle has to come with it: it is created on
// the worker thread and owned on the caller's sequence afterwards.
//
// `engine_missing` is separate from a failure string because the two mean different things to a user:
// no engine is a dev build that has not downloaded one, a failure is an engine that is there and
// broken. Resolving the binary is itself a filesystem touch, so it happens here rather than on the UI
// thread -- doing it in EnsureStarted is a blocking call in a non-blocking scope, and Chromium's
// DCHECK catches it immediately.
struct SidecarClient::LaunchResult {
  base::Process process;
  std::optional<std::string> base_url;
  bool engine_missing = false;
  std::string failure;
};

SidecarClient::SidecarClient() = default;

SidecarClient::~SidecarClient() {
  // The engine is ours; leaving it behind would leak a process that holds the API key.
  if (process_.IsValid()) {
    process_.Terminate(/*exit_code=*/0, /*wait=*/false);
  }
}

std::optional<base::FilePath> SidecarClient::FindEngineBinary() {
  std::unique_ptr<base::Environment> env = base::Environment::Create();
  std::optional<std::string> from_env = env->GetVar(kEngineBinaryEnvVar);
  if (from_env.has_value() && !from_env->empty()) {
    base::FilePath candidate(*from_env);
    if (base::PathExists(candidate)) {
      return candidate;
    }
    // An explicitly configured path that does not exist is a misconfiguration worth saying out loud,
    // rather than silently falling through to a packaged engine that may be a different version.
    LOG(WARNING) << kEngineBinaryEnvVar << " is set to a path that does not exist: " << *from_env;
    return std::nullopt;
  }
  // A packaged build ships the engine beside the browser. Until the packaging step exists there is
  // nothing here, and kUnavailable is the correct, honest answer.
  return std::nullopt;
}

std::optional<std::string> SidecarClient::ParseStartupLine(std::string_view line) {
  std::string_view trimmed = base::TrimWhitespaceASCII(line, base::TRIM_ALL);
  if (!base::StartsWith(trimmed, kStartupPrefix)) {
    return std::nullopt;
  }
  std::string url(trimmed.substr(kStartupPrefix.size()));
  GURL parsed(url);
  // Refuse anything that is not a loopback HTTP origin. The engine is expected to print 127.0.0.1,
  // and accepting whatever it printed would turn a compromised or confused child process into a
  // request the browser makes on its behalf to an arbitrary host.
  if (!parsed.is_valid() || !parsed.SchemeIs("http") || !parsed.HostIsIPAddress() ||
      (parsed.host() != "127.0.0.1" && parsed.host() != "[::1]")) {
    LOG(WARNING) << "the Redrob Code sidecar printed a non-loopback listener, refusing it";
    return std::nullopt;
  }
  return parsed.GetWithEmptyPath().spec();
}

void SidecarClient::SetStatus(Status status) {
  status_ = status;
  if (on_status_change_) {
    on_status_change_.Run(status_);
  }
}

void SidecarClient::EnsureStarted(
    scoped_refptr<network::SharedURLLoaderFactory> url_loader_factory,
    StatusCallback on_status_change) {
  on_status_change_ = std::move(on_status_change);
  url_loader_factory_ = std::move(url_loader_factory);

  if (status_ == Status::kReady || status_ == Status::kStarting) {
    return;
  }

  basic_credentials_ = GenerateBasicCredentials();
  health_attempts_ = 0;
  SetStatus(Status::kStarting);

  // Resolving the binary, launching it and reading its first line all block, so they are one task off
  // the UI thread. One task rather than three because the pipe only makes sense to whoever made it.
  base::ThreadPool::PostTaskAndReplyWithResult(
      FROM_HERE, {base::MayBlock(), base::TaskShutdownBehavior::SKIP_ON_SHUTDOWN},
      base::BindOnce(
          [](std::string credentials) {
            auto result = std::make_unique<LaunchResult>();

            std::optional<base::FilePath> engine = SidecarClient::FindEngineBinary();
            if (!engine.has_value()) {
              result->engine_missing = true;
              return result;
            }

            base::FilePath data_dir;
            if (!base::CreateNewTempDirectory("redrob_sidecar", &data_dir)) {
              result->failure = "could not create a private data directory";
              return result;
            }

            int pipe_fds[2];
            if (!base::CreateLocalNonBlockingPipe(pipe_fds)) {
              result->failure = "could not create a pipe for the engine's startup line";
              return result;
            }
            base::ScopedFD read_end(pipe_fds[0]);
            base::ScopedFD write_end(pipe_fds[1]);

            base::LaunchOptions options;
            base::EnvironmentMap child_env;
            std::unique_ptr<base::Environment> env = base::Environment::Create();
            // The key crosses into the child through the environment only. It is not logged, not put
            // on the command line and not stored on disk by this class.
            if (std::optional<std::string> key = env->GetVar(kApiKeyEnvVar);
                key.has_value() && !key->empty()) {
              child_env[ToNative(kApiKeyEnvVar)] = ToNative(*key);
            }
            child_env[ToNative("XDG_DATA_HOME")] = ToNative(data_dir.AsUTF8Unsafe());
            options.environment = std::move(child_env);
            options.clear_environment = false;
            options.fds_to_remap.emplace_back(write_end.get(), STDOUT_FILENO);

            // Port 0 asks the OS for a free port. Binding a fixed one would race a second profile and
            // Office, and the engine tells us which port it got on the line we are about to read.
            base::CommandLine command(*engine);
            command.AppendSwitchASCII("hostname", "127.0.0.1");
            command.AppendSwitchASCII("port", "0");
            command.AppendArg("serve");

            result->process = base::LaunchProcess(command, options);
            write_end.reset();  // So the read below sees EOF if the child dies.
            if (!result->process.IsValid()) {
              result->failure = "the engine did not start";
              return result;
            }

            // Read until the startup line, EOF, or the timeout. Reading rather than sleeping is the
            // point: a fixed sleep either loses to a slow start or wastes a second on every launch.
            const base::TimeTicks deadline = base::TimeTicks::Now() + kStartupLineTimeout;
            std::string buffer;
            uint8_t chunk[512];
            base::File reader(read_end.release());
            while (base::TimeTicks::Now() < deadline && buffer.size() < kMaxStartupBytes) {
              const std::optional<size_t> read =
                  reader.ReadAtCurrentPosNoBestEffort(base::span(chunk));
              if (!read.has_value()) {
                base::PlatformThread::Sleep(base::Milliseconds(20));
                continue;  // The pipe is non-blocking; nothing available yet.
              }
              if (*read == 0) {
                break;  // EOF: the child exited without printing a listener.
              }
              buffer.append(reinterpret_cast<const char*>(chunk), *read);
              size_t newline = buffer.find('\n');
              while (newline != std::string::npos) {
                if (std::optional<std::string> url =
                        SidecarClient::ParseStartupLine(std::string_view(buffer).substr(0, newline));
                    url.has_value()) {
                  result->base_url = std::move(url);
                  return result;
                }
                buffer.erase(0, newline + 1);
                newline = buffer.find('\n');
              }
            }
            result->failure = "the engine never printed a loopback listener";
            return result;
          },
          basic_credentials_),
      base::BindOnce(&SidecarClient::OnLaunched, weak_factory_.GetWeakPtr()));
}

void SidecarClient::OnLaunched(std::unique_ptr<LaunchResult> result) {
  process_ = std::move(result->process);

  if (result->engine_missing) {
    // Not an error: a dev build that has not downloaded the engine, and the page says so plainly.
    SetStatus(Status::kUnavailable);
    return;
  }

  if (!result->base_url.has_value()) {
    LOG(ERROR) << "Redrob Code sidecar handshake failed: " << result->failure;
    if (process_.IsValid()) {
      process_.Terminate(/*exit_code=*/0, /*wait=*/false);
    }
    SetStatus(Status::kFailed);
    return;
  }

  base_url_ = *result->base_url;
  // Half the handshake. The line proves the listener is bound; health proves it is serving, and only
  // both together justify sending a completion request that would otherwise race the bind.
  PollHealth();
}

void SidecarClient::PollHealth() {
  if (++health_attempts_ > kMaxHealthAttempts) {
    LOG(ERROR) << "the Redrob Code sidecar bound a port but never answered " << kHealthPath;
    base_url_.clear();
    if (process_.IsValid()) {
      process_.Terminate(/*exit_code=*/0, /*wait=*/false);
    }
    SetStatus(Status::kFailed);
    return;
  }

  auto request = std::make_unique<network::ResourceRequest>();
  request->url = GURL(base_url_ + kHealthPath);
  request->method = "GET";
  request->credentials_mode = network::mojom::CredentialsMode::kOmit;
  // The generated credentials, not a user secret, and they never leave the browser process.
  request->headers.SetHeader("Authorization",
                             "Basic " + base::Base64Encode("redrob:" + basic_credentials_));

  static constexpr net::NetworkTrafficAnnotationTag kAnnotation =
      net::DefineNetworkTrafficAnnotation("redrob_sidecar_health", R"(
        semantics {
          sender: "Redrob AI surface"
          description:
            "Checks that the locally launched Redrob Code engine is serving before any task is sent "
            "to it. The request never leaves the machine."
          trigger: "The user starts a task on chrome://redrob."
          data: "None. A generated per-launch credential authenticates to the local process."
          destination: LOCAL
        }
        policy {
          cookies_allowed: NO
          setting: "Tied to using the Redrob AI surface; no separate setting."
          policy_exception_justification: "Does not contact a remote server."
        })");

  health_loader_ = network::SimpleURLLoader::Create(std::move(request), kAnnotation);
  health_loader_->SetTimeoutDuration(base::Seconds(2));
  health_loader_->DownloadToString(
      url_loader_factory_.get(),
      base::BindOnce(&SidecarClient::OnHealthResponse, weak_factory_.GetWeakPtr()),
      /*max_body_size=*/4 * 1024);
}

void SidecarClient::OnHealthResponse(std::optional<std::string> body) {
  const int response_code = health_loader_->ResponseInfo() && health_loader_->ResponseInfo()->headers
                                ? health_loader_->ResponseInfo()->headers->response_code()
                                : -1;
  health_loader_.reset();

  if (response_code == net::HTTP_OK) {
    SetStatus(Status::kReady);
    return;
  }

  // A 401 means the engine is up but rejected our credential, which retrying cannot fix. Anything
  // else during startup is expected to be transient -- the listener is bound before the routes are.
  if (response_code == net::HTTP_UNAUTHORIZED || response_code == net::HTTP_FORBIDDEN) {
    LOG(ERROR) << "the Redrob Code sidecar refused the generated credential";
    base_url_.clear();
    if (process_.IsValid()) {
      process_.Terminate(/*exit_code=*/0, /*wait=*/false);
    }
    SetStatus(Status::kFailed);
    return;
  }

  base::SequencedTaskRunner::GetCurrentDefault()->PostDelayedTask(
      FROM_HERE, base::BindOnce(&SidecarClient::PollHealth, weak_factory_.GetWeakPtr()),
      kHealthRetryDelay);
}

}  // namespace redrob
