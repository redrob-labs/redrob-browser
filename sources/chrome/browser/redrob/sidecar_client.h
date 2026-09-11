// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_REDROB_SIDECAR_CLIENT_H_
#define CHROME_BROWSER_REDROB_SIDECAR_CLIENT_H_

#include <memory>
#include <optional>
#include <string>

#include "base/files/file_path.h"
#include "base/functional/callback.h"
#include "base/memory/weak_ptr.h"
#include "base/process/process.h"

namespace redrob {

// Talks to a local Redrob Code process over loopback. See docs/AI_SURFACE.md for why the engine is a
// separate process rather than code in the browser: it keeps inference, credentials and model updates
// out of Chromium's four-week release train, and Office already ships this arrangement.
//
// The security shape matters more than the feature:
//
//  * loopback only, on a port the OS chose. Nothing routable is ever bound.
//  * Basic credentials generated per launch, held here and never given to a renderer.
//  * the API key is passed in the child's environment, not on a command line where `ps` would show it.
//  * the sidecar's storage is redirected to a per-profile temporary path, so a browser profile and an
//    Office session cannot read each other's history.
//
// This class does not parse model output and does not execute tools. The sidecar proposes tool calls;
// deciding which of them the browser is willing to run is the caller's business, and that division is
// the boundary the whole design rests on.
class SidecarClient {
 public:
  enum class Status {
    // Not started. The engine binary was not found, which is the normal state of a dev build that has
    // not downloaded it -- Work packages Redrob Code as a downloaded sidecar and this follows suit.
    kUnavailable,
    kStarting,
    kReady,
    // Started and then stopped answering. Distinguished from kUnavailable because it is worth
    // surfacing differently: one is "not installed", the other is "it died".
    kFailed,
  };

  using StatusCallback = base::RepeatingCallback<void(Status)>;

  SidecarClient();
  SidecarClient(const SidecarClient&) = delete;
  SidecarClient& operator=(const SidecarClient&) = delete;
  ~SidecarClient();

  // Resolve the engine binary without launching anything. REDROB_CODE_BIN wins, which is the seam a
  // development build uses; otherwise the packaged sidecar path is consulted.
  static std::optional<base::FilePath> FindEngineBinary();

  Status status() const { return status_; }

  // Idempotent: a second call while the process is healthy is a no-op rather than a second engine.
  void EnsureStarted(StatusCallback on_status_change);

  // The loopback base URL, e.g. http://127.0.0.1:48213. Empty until kReady.
  const std::string& base_url() const { return base_url_; }

 private:
  void OnProcessLaunched(bool launched);

  Status status_ = Status::kUnavailable;
  std::string base_url_;
  // Generated per launch. Deliberately not exposed: a getter here would be a getter a renderer-facing
  // class could eventually be tempted to call.
  std::string basic_credentials_;
  base::FilePath data_dir_;
  base::Process process_;
  StatusCallback on_status_change_;
  base::WeakPtrFactory<SidecarClient> weak_factory_{this};
};

}  // namespace redrob

#endif  // CHROME_BROWSER_REDROB_SIDECAR_CLIENT_H_
