// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/redrob/sidecar_client.h"

#include <utility>

#include "base/base64.h"
#include "base/environment.h"
#include "base/files/file_util.h"
#include "base/functional/bind.h"
#include "base/logging.h"
#include "base/process/launch.h"
#include "base/rand_util.h"
#include "base/strings/strcat.h"
#include "base/strings/string_number_conversions.h"
#include "base/strings/utf_string_conversions.h"
#include "build/build_config.h"
#include "base/task/thread_pool.h"

namespace redrob {
namespace {

// The environment variable a development build points at a locally built engine. Office and Work use
// the same name, so one checkout serves all three.
constexpr char kEngineBinaryEnvVar[] = "REDROB_CODE_BIN";
// Passed through to the child, never read into this process's memory beyond the handoff.
constexpr char kApiKeyEnvVar[] = "REDROB_API_KEY";

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

void SidecarClient::EnsureStarted(StatusCallback on_status_change) {
  on_status_change_ = std::move(on_status_change);

  if (status_ == Status::kReady || status_ == Status::kStarting) {
    return;
  }

  std::optional<base::FilePath> binary = FindEngineBinary();
  if (!binary.has_value()) {
    status_ = Status::kUnavailable;
    if (on_status_change_) {
      on_status_change_.Run(status_);
    }
    return;
  }

  status_ = Status::kStarting;
  if (on_status_change_) {
    on_status_change_.Run(status_);
  }

  basic_credentials_ = GenerateBasicCredentials();

  // A per-launch data directory so the engine's session store cannot be shared with another Redrob
  // app's, and so a stale store cannot outlive the browser that made it.
  if (!base::CreateNewTempDirectory("redrob_sidecar", &data_dir_)) {
    LOG(ERROR) << "could not create a private data directory for the Redrob Code sidecar";
    status_ = Status::kFailed;
    if (on_status_change_) {
      on_status_change_.Run(status_);
    }
    return;
  }

  base::LaunchOptions options;
  std::unique_ptr<base::Environment> env = base::Environment::Create();
  base::EnvironmentMap child_env;
  // The key crosses into the child through the environment only. It is not logged, not put on the
  // command line and not stored on disk by this class.
  if (std::optional<std::string> key = env->GetVar(kApiKeyEnvVar);
      key.has_value() && !key->empty()) {
    child_env[ToNative(kApiKeyEnvVar)] =
        ToNative(*key);
  }
  child_env[ToNative("XDG_DATA_HOME")] =
      ToNative(data_dir_.AsUTF8Unsafe());
  options.environment = std::move(child_env);
  options.clear_environment = false;

  // Port 0 asks the OS for a free port; the engine prints the one it got, and reading that startup
  // line is what the next revision replaces this early return with. Binding a fixed port would race
  // with a second profile and with Office.
  base::CommandLine command(*binary);
  command.AppendSwitchASCII("hostname", "127.0.0.1");
  command.AppendSwitchASCII("port", "0");
  command.AppendArg("serve");

  process_ = base::LaunchProcess(command, options);
  OnProcessLaunched(process_.IsValid());
}

void SidecarClient::OnProcessLaunched(bool launched) {
  if (!launched) {
    LOG(ERROR) << "the Redrob Code sidecar did not start";
    status_ = Status::kFailed;
    if (on_status_change_) {
      on_status_change_.Run(status_);
    }
    return;
  }

  // Not kReady yet, and deliberately so. Readiness means the engine printed its startup line AND
  // GET /global/health answered: the line proves the process started, health proves it is serving,
  // and reporting ready on a launched process alone is how a first request races the server's bind.
  // That handshake needs the startup line reader, which is the next commit; until then the status
  // stops here rather than claiming a working engine.
  status_ = Status::kStarting;
  if (on_status_change_) {
    on_status_change_.Run(status_);
  }
}

}  // namespace redrob
