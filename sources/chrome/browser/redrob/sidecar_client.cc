// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/redrob/sidecar_client.h"

#include <utility>

#include "base/base64.h"
#include "base/json/json_reader.h"
#include "base/values.h"
#include "base/memory/raw_ptr.h"
#include "base/containers/span.h"
#include "base/environment.h"
#include "base/files/file.h"
#include "base/files/file_util.h"
#include "base/base_paths.h"
#include "base/path_service.h"
#include "base/functional/bind.h"
#include "base/functional/callback_helpers.h"
#include "base/logging.h"
#include "base/process/launch.h"
#include "base/threading/platform_thread.h"
#include "base/rand_util.h"
#include "base/strings/strcat.h"
#include "base/strings/string_number_conversions.h"
#include "base/strings/string_util.h"
#include "base/strings/string_split.h"
#include "base/strings/utf_string_conversions.h"
#include "base/task/sequenced_task_runner.h"
#include "base/task/thread_pool.h"
#include "build/build_config.h"
#include "net/http/http_status_code.h"
#include "net/traffic_annotation/network_traffic_annotation.h"
#include "services/network/public/cpp/resource_request.h"
#include "services/network/public/cpp/simple_url_loader.h"
#include "services/network/public/cpp/simple_url_loader_stream_consumer.h"
#include "services/network/public/mojom/url_response_head.mojom.h"
#include "url/gurl.h"

namespace redrob {
namespace {

// The environment variable a development build points at a locally built engine. Office and Work use
// the same name, so one checkout serves all three.
constexpr char kEngineBinaryEnvVar[] = "REDROB_CODE_BIN";
// Passed through to the child, never read into this process's memory beyond the handoff.
constexpr char kApiKeyEnvVar[] = "REDROB_API_KEY";
// The engine reads its Basic password from here and enforces auth only when it is set. Its username
// defaults to "redrob", which is the user half this class sends.
constexpr char kServerPasswordEnvVar[] = "REDROB_SERVER_PASSWORD";

// The engine's file name and this platform's PATH separator. Both differ on Windows, and getting either
// wrong is a silent "not installed" rather than an error.
#if BUILDFLAG(IS_WIN)
constexpr base::FilePath::CharType kEngineFileName[] = FILE_PATH_LITERAL("redrob.exe");
constexpr char kPathSeparator[] = ";";
#else
constexpr base::FilePath::CharType kEngineFileName[] = FILE_PATH_LITERAL("redrob");
constexpr char kPathSeparator[] = ":";
#endif

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

// The engine answers a completion as OpenAI-compatible server-sent events. Its exact emission is the
// contract this parser is written against, not a general SSE reader:
//
//   data: {"choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}
//   data: {"choices":[{"index":0,"delta":{"content":"..."},"finish_reason":null}]}
//   data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"...","type":"function",
//                                                       "function":{"name":"...","arguments":"..."}}]}}]}
//   data: {"choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}
//   data: [DONE]
//
// Two properties of that stream drive the whole design here. A tool call's `arguments` is streamed in
// fragments and its `name` appears only on the fragment that introduces the index, so calls must be
// accumulated per index and emitted whole. And a chunk boundary is not a line boundary: one
// OnDataReceived can carry half a line, several lines, or both.
class SidecarClient::CompletionStream : public network::SimpleURLLoaderStreamConsumer {
 public:
  CompletionStream(CompletionDelegate* delegate, std::unique_ptr<network::SimpleURLLoader> loader)
      : delegate_(delegate), loader_(std::move(loader)) {}
  ~CompletionStream() override = default;

  void Start(network::SharedURLLoaderFactory* factory) {
    loader_->DownloadAsStream(factory, this);
  }

  // network::SimpleURLLoaderStreamConsumer
  void OnDataReceived(std::string_view chunk, base::OnceClosure resume) override {
    buffer_.append(chunk);
    // A local process could still stream a line without end, and this buffer is browser-process memory.
    // Refusing is better than growing until something else fails.
    if (buffer_.size() > kMaxBufferedBytes) {
      Fail("The engine sent a malformed response.");
      std::move(resume).Run();
      return;
    }
    size_t newline = std::string::npos;
    while ((newline = buffer_.find('\n')) != std::string::npos) {
      std::string line = buffer_.substr(0, newline);
      buffer_.erase(0, newline + 1);
      if (!line.empty() && line.back() == '\r') {
        line.pop_back();
      }
      HandleLine(line);
    }
    std::move(resume).Run();
  }

  void OnComplete(bool success) override {
    if (failed_) {
      return;
    }
    if (!success) {
      Fail("The connection to the engine ended before the answer did.");
      return;
    }
    // A stream that stops cleanly without a finish_reason still ended the turn, and the caller needs to
    // stop showing it as running. Reported as the engine's own default rather than as an error.
    if (!finished_) {
      FlushToolCalls();
      finished_ = true;
      delegate_->OnCompletionFinished("stop");
    }
  }

  void OnRetry(base::OnceClosure start_retry) override {
    // Not configured for retries. Replaying a half-delivered turn would double the prose the caller has
    // already been handed, and re-propose tool calls it may already have run.
    Fail("The engine's answer was interrupted.");
  }

 private:
  static constexpr size_t kMaxBufferedBytes = 1024 * 1024;

  struct PendingToolCall {
    std::string id;
    std::string name;
    std::string arguments;
  };

  void HandleLine(const std::string& line) {
    if (failed_ || finished_) {
      return;
    }
    // Comments and the event/id fields of the SSE format are not part of this contract; ignoring them is
    // deliberate rather than an omission.
    static constexpr std::string_view kDataPrefix = "data:";
    if (!line.starts_with(kDataPrefix)) {
      return;
    }
    std::string_view payload = std::string_view(line).substr(kDataPrefix.size());
    while (!payload.empty() && payload.front() == ' ') {
      payload.remove_prefix(1);
    }
    if (payload.empty()) {
      return;
    }
    if (payload == "[DONE]") {
      FlushToolCalls();
      if (!finished_) {
        finished_ = true;
        delegate_->OnCompletionFinished(finish_reason_.empty() ? "stop" : finish_reason_);
      }
      return;
    }

    std::optional<base::DictValue> parsed = base::JSONReader::ReadDict(payload, base::JSON_PARSE_RFC);
    if (!parsed) {
      // One unreadable frame does not invalidate the turn: skipping it keeps a stream alive that is
      // otherwise fine, and the engine's own error frames arrive through the branch below.
      return;
    }
    const base::DictValue& dict = *parsed;

    if (const base::DictValue* error = dict.FindDict("error")) {
      const std::string* message = error->FindString("message");
      Fail(message && !message->empty() ? *message : "The engine reported an error.");
      return;
    }

    const base::ListValue* choices = dict.FindList("choices");
    if (!choices || choices->empty()) {
      return;
    }
    const base::DictValue* choice = choices->front().GetIfDict();
    if (!choice) {
      return;
    }

    if (const base::DictValue* delta = choice->FindDict("delta")) {
      if (const std::string* content = delta->FindString("content")) {
        if (!content->empty()) {
          delegate_->OnCompletionText(*content);
        }
      }
      if (const std::string* reasoning = delta->FindString("reasoning_content")) {
        if (!reasoning->empty()) {
          delegate_->OnCompletionReasoning(*reasoning);
        }
      }
      if (const base::ListValue* tool_calls = delta->FindList("tool_calls")) {
        for (const base::Value& entry : *tool_calls) {
          AccumulateToolCall(entry.GetIfDict());
        }
      }
    }

    if (const std::string* reason = choice->FindString("finish_reason")) {
      // Recorded rather than acted on. [DONE] is what ends the turn, and tool calls whose last argument
      // fragment shares this frame must be flushed before anyone is told the turn is over.
      finish_reason_ = *reason;
    }
  }

  void AccumulateToolCall(const base::DictValue* entry) {
    if (!entry) {
      return;
    }
    // The index is the wire's identity for a call across fragments. Without it, two calls proposed in one
    // turn would concatenate into one unparseable argument string.
    const std::optional<int> index = entry->FindInt("index");
    if (!index.has_value() || *index < 0 || *index > kMaxToolCallsPerTurn) {
      return;
    }
    PendingToolCall& pending = pending_tool_calls_[*index];
    if (const std::string* id = entry->FindString("id")) {
      pending.id = *id;
    }
    if (const base::DictValue* function = entry->FindDict("function")) {
      if (const std::string* name = function->FindString("name")) {
        pending.name = *name;
      }
      if (const std::string* arguments = function->FindString("arguments")) {
        if (pending.arguments.size() + arguments->size() <= kMaxArgumentBytes) {
          pending.arguments.append(*arguments);
        }
      }
    }
  }

  void FlushToolCalls() {
    // Ordered by wire index so the caller runs the tools in the order the engine proposed them.
    for (auto& [index, pending] : pending_tool_calls_) {
      if (pending.name.empty()) {
        continue;
      }
      delegate_->OnCompletionToolCall(pending.id, pending.name,
                                      pending.arguments.empty() ? "{}" : pending.arguments);
    }
    pending_tool_calls_.clear();
  }

  void Fail(const std::string& message) {
    if (failed_ || finished_) {
      return;
    }
    failed_ = true;
    // Deliberately dropped: a turn that failed must not also deliver tool calls. Running a tool proposed
    // by an answer that never completed is the one outcome worth ruling out structurally.
    pending_tool_calls_.clear();
    delegate_->OnCompletionFailed(message);
  }

  static constexpr int kMaxToolCallsPerTurn = 64;
  static constexpr size_t kMaxArgumentBytes = 64 * 1024;

  raw_ptr<CompletionDelegate> delegate_;
  std::unique_ptr<network::SimpleURLLoader> loader_;
  std::string buffer_;
  std::map<int, PendingToolCall> pending_tool_calls_;
  std::string finish_reason_;
  bool finished_ = false;
  bool failed_ = false;
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
  //
  // Before concluding that, look where the engine actually installs itself. The shared-install design
  // gives one resolution order for every product -- the override above, then the install location, then
  // PATH -- and this function used to stop after the override, so a machine with a perfectly good engine
  // installed reported "not installed" unless the user also knew to set an environment variable.
  base::FilePath home;
  if (base::PathService::Get(base::DIR_HOME, &home)) {
    base::FilePath installed =
        home.Append(FILE_PATH_LITERAL(".redrob")).Append(FILE_PATH_LITERAL("bin")).Append(kEngineFileName);
    if (base::PathExists(installed)) {
      return installed;
    }
  }

  // PATH, last, and walked here rather than handed to the launcher. The first version of this asked
  // base::ExecutableExistsInPath and returned the bare name for execvp to resolve, which is POSIX-only
  // in two ways at once: that helper does not exist on Windows, so the branch was compiled out and the
  // engine was findable there ONLY through the environment override -- and the name it looked for had no
  // .exe, so the install location above could never match on Windows either. Walking PATH ourselves is a
  // dozen lines, has no platform guard, and returns a real path on every platform instead of trusting a
  // launcher to repeat the search.
  std::optional<std::string> path_var = env->GetVar("PATH");
  if (path_var.has_value()) {
    for (std::string_view entry :
         base::SplitStringPiece(*path_var, std::string_view(kPathSeparator), base::TRIM_WHITESPACE,
                                base::SPLIT_WANT_NONEMPTY)) {
      base::FilePath candidate = base::FilePath::FromUTF8Unsafe(entry).Append(kEngineFileName);
      if (base::PathExists(candidate)) {
        return candidate;
      }
    }
  }
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
            // The per-launch credential this class authenticates with, handed to the engine so it
            // actually ENFORCES it. This was generated, bound into this task, and then never used: the
            // engine requires HTTP Basic only when a password is configured, so with none configured our
            // Authorization header was ignored and the loopback port accepted requests from anything on
            // the machine that found it -- while this file's own comment claimed the engine was
            // "authenticated by a per-launch credential". It is now. Same route as the API key: the
            // environment only, never the command line, never a log, never disk.
            child_env[ToNative(kServerPasswordEnvVar)] = ToNative(credentials);
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

void SidecarClient::FetchProviders(ProvidersCallback callback) {
  if (status_ != Status::kReady || base_url_.empty()) {
    // Not serving. The caller treats this the same as an engine that has none to offer, which is the
    // honest answer either way.
    std::move(callback).Run(std::nullopt);
    return;
  }

  auto request = std::make_unique<network::ResourceRequest>();
  request->url = GURL(base_url_ + "/config/providers");
  request->method = "GET";
  request->credentials_mode = network::mojom::CredentialsMode::kOmit;
  request->headers.SetHeader("Authorization",
                             "Basic " + base::Base64Encode("redrob:" + basic_credentials_));

  static constexpr net::NetworkTrafficAnnotationTag kAnnotation =
      net::DefineNetworkTrafficAnnotation("redrob_sidecar_providers", R"(
        semantics {
          sender: "Redrob AI surface"
          description:
            "Asks the locally launched Redrob Code engine which AI providers and models it is "
            "configured to route to, so the model chooser offers what this machine can actually run "
            "instead of a hardcoded entry. The request never leaves the machine."
          trigger: "The engine becomes ready, or the user opens the model chooser."
          data: "None. A generated per-launch credential authenticates to the local process."
          destination: LOCAL
        }
        policy {
          cookies_allowed: NO
          setting: "Tied to using the Redrob AI surface; no separate setting."
          policy_exception_justification: "Does not contact a remote server."
        })");

  providers_loader_ = network::SimpleURLLoader::Create(std::move(request), kAnnotation);
  providers_loader_->SetTimeoutDuration(base::Seconds(5));
  providers_loader_->DownloadToString(
      url_loader_factory_.get(),
      base::BindOnce(&SidecarClient::OnProvidersResponse, weak_factory_.GetWeakPtr(),
                     std::move(callback)),
      // A catalogue of a few hundred models with capability and cost records for each. Generous, but
      // bounded: an engine that answers this path with something enormous is answering wrongly.
      /*max_body_size=*/512 * 1024);
}

void SidecarClient::OnProvidersResponse(ProvidersCallback callback,
                                        std::optional<std::string> body) {
  providers_loader_.reset();
  std::move(callback).Run(std::move(body));
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


void SidecarClient::StartCompletion(std::string request_json, CompletionDelegate* delegate) {
  CHECK(delegate);
  // Refused rather than queued. A caller that starts a turn while the engine is not ready has a bug in
  // its own state machine, and answering it with a failure says so.
  if (status_ != Status::kReady || base_url_.empty()) {
    delegate->OnCompletionFailed("The Redrob Code engine is not ready.");
    return;
  }

  static constexpr net::NetworkTrafficAnnotationTag kAnnotation =
      net::DefineNetworkTrafficAnnotation("redrob_sidecar_completion", R"(
        semantics {
          sender: "Redrob AI surface"
          description:
            "Sends the task the user typed on the Redrob new tab page, and the task's history, to the "
            "locally launched Redrob Code engine, which answers as a stream. The request never leaves "
            "the machine; the engine itself contacts the model provider the user configured."
          trigger: "The user starts or replies to a task on the Redrob AI surface."
          data:
            "The user's prompt, the task's previous messages, results of tools the browser ran for the "
            "task, and a generated per-launch credential for the local process."
          destination: LOCAL
        }
        policy {
          cookies_allowed: NO
          setting: "Tied to using the Redrob AI surface; no separate setting."
          policy_exception_justification: "Does not contact a remote server."
        })");

  auto request = std::make_unique<network::ResourceRequest>();
  // `/v1/chat/completions`, not the `/experimental/external/...` path this line used to hold. That path
  // was never served by anything: the engine's experimental group registers capabilities, console, tool,
  // worktree, session and resource, and the string "external" does not appear in its server at all -- so
  // every task this browser has ever started went to a 404. The engine's design of record makes the
  // OpenAI face real at this stable path and names this call site as the browser's half of the migration.
  //
  // The contract we are already on the right side of: we declare `tools`, which under that design means
  // the CALLER owns them and the engine only emits tool_calls -- which is what this client's own tool
  // loop expects, because a browser's tools drive a live tab and an engine executing them would act on
  // the wrong machine entirely.
  request->url = GURL(base_url_ + "/v1/chat/completions");
  request->method = "POST";
  // The engine is a local process reached over loopback and authenticated by a per-launch credential.
  // Anything the cookie jar would add is at best irrelevant and at worst a profile secret sent to a
  // process that has no business seeing it.
  request->credentials_mode = network::mojom::CredentialsMode::kOmit;
  request->headers.SetHeader(net::HttpRequestHeaders::kAuthorization,
                             "Basic " + base::Base64Encode("redrob:" + basic_credentials_));

  auto loader = network::SimpleURLLoader::Create(std::move(request), kAnnotation);
  loader->AttachStringForUpload(std::move(request_json), "application/json");
  // The outgoing stream is retired on a later task rather than freed here. A caller can reach this
  // from inside the previous stream's own delivery callback -- a tool that answers synchronously does
  // exactly that -- and freeing it under itself is a use-after-free that only shows up once a task runs
  // enough rounds to hit it.
  if (completion_) {
    base::SequencedTaskRunner::GetCurrentDefault()->PostTask(
        FROM_HERE, base::DoNothingWithBoundArgs(std::move(completion_)));
  }
  completion_ = std::make_unique<CompletionStream>(delegate, std::move(loader));
  completion_->Start(url_loader_factory_.get());
}

void SidecarClient::SetLoaderFactory(
    scoped_refptr<network::SharedURLLoaderFactory> url_loader_factory) {
  if (!url_loader_factory_) {
    url_loader_factory_ = std::move(url_loader_factory);
  }
}

void SidecarClient::StartDirectCompletion(const std::string& endpoint,                                          const std::string& bearer_token,
                                          std::string request_json,
                                          CompletionDelegate* delegate) {
  CHECK(delegate);
  const GURL base(endpoint);
  // Re-checked here even though ModelStore already refused anything else when the provider was saved.
  // This is the function that puts the user's page text on the wire, so it is the right place for the
  // check that says it goes there encrypted.
  if (!base.is_valid() || !base.SchemeIs("https")) {
    delegate->OnCompletionFailed("That provider's endpoint is not a valid https address.");
    return;
  }
  if (bearer_token.empty()) {
    delegate->OnCompletionFailed(
        "There is no key for that provider on this machine. Reconnect it in Settings.");
    return;
  }

  static constexpr net::NetworkTrafficAnnotationTag kAnnotation =
      net::DefineNetworkTrafficAnnotation("redrob_direct_provider_completion", R"(
        semantics {
          sender: "Redrob AI surface"
          description:
            "Sends the task the user typed on the Redrob new tab page, the task's history, and the text "
            "of pages the task read, to the model provider the user connected in Redrob settings. This "
            "request leaves the machine and goes to that provider, not to Google and not to Redrob."
          trigger:
            "The user connected their own model provider in Redrob settings, selected it, and started or "
            "replied to a task."
          data:
            "The user's prompt, the task's previous messages, the visible text of pages the task opened, "
            "results of tools the browser ran, and the API key the user supplied for that provider."
          destination: OTHER
          destination_other: "The model provider whose endpoint the user entered in Redrob settings."
        }
        policy {
          cookies_allowed: NO
          setting:
            "Off unless the user adds a provider in Redrob settings and selects it. Selecting the "
            "built-in engine stops these requests."
          policy_exception_justification: "No policy yet; the fork's enterprise story is not built."
        })");

  auto request = std::make_unique<network::ResourceRequest>();
  // Appended to whatever path the user's base URL already has, the way every OpenAI-compatible client
  // does it: their `/v1` plus our `/chat/completions`.
  std::string spec = base.spec();
  while (!spec.empty() && spec.back() == '/') {
    spec.pop_back();
  }
  request->url = GURL(spec + "/chat/completions");
  request->method = "POST";
  // No cookies to a third party, ever. The key is the credential; a cookie jar entry for that host
  // would be an unrelated secret sent along for no reason.
  request->credentials_mode = network::mojom::CredentialsMode::kOmit;
  request->headers.SetHeader(net::HttpRequestHeaders::kAuthorization, "Bearer " + bearer_token);

  auto loader = network::SimpleURLLoader::Create(std::move(request), kAnnotation);
  loader->AttachStringForUpload(std::move(request_json), "application/json");
  if (completion_) {
    base::SequencedTaskRunner::GetCurrentDefault()->PostTask(
        FROM_HERE, base::DoNothingWithBoundArgs(std::move(completion_)));
  }
  completion_ = std::make_unique<CompletionStream>(delegate, std::move(loader));
  completion_->Start(url_loader_factory_.get());
}

void SidecarClient::CancelCompletion() {
  // A cancel can arrive from within the stream's own callback, so the stream is retired on a later task
  // rather than freed here.
  if (completion_) {
    base::SequencedTaskRunner::GetCurrentDefault()->PostTask(
        FROM_HERE, base::DoNothingWithBoundArgs(std::move(completion_)));
  }
}

}  // namespace redrob
