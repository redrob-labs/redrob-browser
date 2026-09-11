// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_REDROB_SIDECAR_CLIENT_H_
#define CHROME_BROWSER_REDROB_SIDECAR_CLIENT_H_

#include <memory>
#include <optional>
#include <string>
#include <string_view>

#include "base/files/file_path.h"
#include "base/functional/callback.h"
#include "base/memory/scoped_refptr.h"
#include "base/memory/weak_ptr.h"
#include "base/process/process.h"
#include "base/time/time.h"
#include "services/network/public/cpp/shared_url_loader_factory.h"

namespace network {
class SimpleURLLoader;
}  // namespace network

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
//  * the sidecar's storage is redirected to a per-launch temporary path, so a browser profile and an
//    Office session cannot see each other's sessions.
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
    // Launched, but not answering yet. Readiness is a two-step handshake and this is the gap between
    // its halves: the process is up, the port is not necessarily bound.
    kStarting,
    kReady,
    // Started and then stopped answering, or never finished the handshake. Distinguished from
    // kUnavailable because it is worth surfacing differently: one is "not installed", the other is
    // "it is there and it is broken".
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

  // The startup line the engine prints, parsed into a base URL. Static and exposed because this is the
  // one piece of the handshake that depends on an upstream output format rather than on our own code,
  // so it is worth being pinnable without launching a process.
  static std::optional<std::string> ParseStartupLine(std::string_view line);

  Status status() const { return status_; }

  // Idempotent: a second call while the process is healthy is a no-op rather than a second engine.
  // `url_loader_factory` is used for the loopback health probe.
  void EnsureStarted(scoped_refptr<network::SharedURLLoaderFactory> url_loader_factory,
                     StatusCallback on_status_change);

  // The loopback base URL, e.g. http://127.0.0.1:48213. Empty until kReady.
  const std::string& base_url() const { return base_url_; }

  // Receives one streamed turn, already framed and parsed but NOT interpreted. The split is the one
  // this class's comment promises: text and proposed tool calls come out here, and whether the browser
  // is willing to run any of those calls is decided by the delegate, never in here.
  class CompletionDelegate {
   public:
    // Assistant prose, in the fragments the engine emitted. Callers must not assume sentence or even
    // UTF-8 codepoint boundaries between calls.
    virtual void OnCompletionText(std::string_view text) = 0;
    // The engine's private reasoning, which is deliberately routed separately: it is not the answer and
    // a surface that renders it as prose would be misrepresenting it.
    virtual void OnCompletionReasoning(std::string_view text) = 0;
    // A tool the engine WANTS run, with its arguments as the JSON text the engine produced. Delivered
    // only once the arguments are complete -- they arrive in fragments on the wire and a half-parsed
    // argument list is not something a caller should ever have to defend against.
    virtual void OnCompletionToolCall(const std::string& id,
                                      const std::string& name,
                                      const std::string& arguments_json) = 0;
    // "stop", "tool_calls", "length" -- the engine's own reason, passed through unchanged.
    virtual void OnCompletionFinished(const std::string& finish_reason) = 0;
    virtual void OnCompletionFailed(const std::string& message) = 0;

   protected:
    virtual ~CompletionDelegate() = default;
  };

  // Streams POST /experimental/external/chat/completions. `request_json` is the OpenAI-compatible body
  // the caller composed; this class does not build it, because the message history and the tool list
  // are exactly the parts a caller must stay responsible for.
  //
  // One turn at a time per client: a second call cancels the first. `delegate` must outlive the turn or
  // cancel it in its destructor.
  void StartCompletion(std::string request_json, CompletionDelegate* delegate);
  void CancelCompletion();

 private:
  struct LaunchResult;
  // SSE framing and delta accumulation. Defined in the .cc: the wire format is an implementation
  // detail of talking to the engine, not part of this class's contract.
  class CompletionStream;

  void SetStatus(Status status);
  void OnLaunched(std::unique_ptr<LaunchResult> result);
  void PollHealth();
  void OnHealthResponse(std::optional<std::string> body);

  Status status_ = Status::kUnavailable;
  std::string base_url_;
  // Generated per launch. Deliberately not exposed: a getter here would be a getter a renderer-facing
  // class could eventually be tempted to call.
  std::string basic_credentials_;
  base::FilePath data_dir_;
  base::Process process_;
  StatusCallback on_status_change_;

  scoped_refptr<network::SharedURLLoaderFactory> url_loader_factory_;
  std::unique_ptr<network::SimpleURLLoader> health_loader_;
  int health_attempts_ = 0;
  std::unique_ptr<CompletionStream> completion_;

  base::WeakPtrFactory<SidecarClient> weak_factory_{this};
};

}  // namespace redrob

#endif  // CHROME_BROWSER_REDROB_SIDECAR_CLIENT_H_
