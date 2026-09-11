// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_REDROB_RPC_SERVER_H_
#define CHROME_BROWSER_REDROB_RPC_SERVER_H_

#include <memory>
#include <string>
#include <vector>

#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "base/task/sequenced_task_runner.h"
#include "base/threading/thread.h"
#include "base/values.h"
#include "chrome/browser/redrob/task_store.h"
#include "components/keyed_service/core/keyed_service.h"

class Profile;

namespace redrob {

// One loopback HTTP endpoint, serving the three things a browser this shape needs a socket for:
//
//   * the CLI. `redrob --redrob-task="..."` already works with no setup, because the process singleton
//     forwards a command line to the running browser -- but that channel answers with an ACK and
//     carries no payload back, so nothing can be printed. When the answer has to reach the terminal,
//     it comes through here.
//   * an MCP server, so another agent can call this browser as a tool. POST /mcp speaks JSON-RPC 2.0
//     with initialize / tools/list / tools/call, and every tool it exposes goes through the SAME
//     StartTask the surface uses -- an external caller cannot reach a capability, or skip a permission
//     gate, that the agent inside the browser does not have.
//   * a REPL, which is those verbs used one at a time.
//
// THE SECURITY POSTURE, which is why this is off by default. A local HTTP server that can drive the
// browser is, to any other process on the machine, the browser. So: loopback only; a bearer token
// generated per launch and required before anything looks at the path; the token in a file inside the
// profile directory with owner-only permissions, which puts reading it behind the same boundary as
// reading the cookie database; and off unless the user turns it on in Settings or passes --redrob-rpc.
// Chromium takes the same position on remote debugging, for the same reason.
//
// THREADS. net::HttpServer needs an IO message pump -- SocketPosix::Accept DCHECKs on anything else --
// so the socket lives on a dedicated IO thread while TaskStore stays where it belongs, on the UI
// thread. Requests hop UI-ward to be answered and the answers hop back. That is also the arrangement
// DevToolsHttpHandler uses, and finding out the hard way that a UI-thread HttpServer dies on its first
// connection is why this class is shaped like this rather than simpler.
class RpcServer : public KeyedService, public TaskStore::Observer {
 public:
  RpcServer(Profile* profile, TaskStore* tasks);
  RpcServer(const RpcServer&) = delete;
  RpcServer& operator=(const RpcServer&) = delete;
  ~RpcServer() override;

  // Starts the IO thread and binds loopback on a port the OS picks. Returns false only when the thread
  // itself cannot start; the bind result arrives asynchronously and lands in `endpoint()`.
  bool Start();
  void Stop();
  bool running() const { return io_thread_ != nullptr; }
  // Empty until the bind has come back. Loopback only.
  const std::string& endpoint() const { return endpoint_; }

  // TaskStore::Observer
  void OnTaskChanged(const mojom::Task& task) override;

 private:
  // Owns the socket and lives entirely on the IO thread.
  class Listener;

  struct Reply {
    int status = 200;
    base::DictValue body;
  };

  // Called on the UI thread with one already-authenticated request. `respond` is bound to the IO
  // thread.
  void HandleRequest(const std::string& method,
                     std::vector<std::string> segments,
                     base::DictValue request,
                     base::OnceCallback<void(int, std::string)> respond);

  Reply HandleTask(const base::DictValue& request);
  Reply HandleTaskGet(const std::string& task_id);
  Reply HandleFollowUp(const std::string& task_id, const base::DictValue& request);
  Reply HandleCancel(const std::string& task_id);
  Reply HandleMcp(const base::DictValue& request);

  base::DictValue TaskToDict(const mojom::Task& task) const;
  void OnBound(const std::string& endpoint);
  void WriteHandleFile();
  void DeleteHandleFile();

  raw_ptr<Profile> profile_;
  raw_ptr<TaskStore> tasks_;
  std::unique_ptr<base::Thread> io_thread_;
  // Created on the IO thread and deleted there. Never dereferenced from the UI thread.
  std::unique_ptr<Listener> listener_;
  std::string token_;
  std::string endpoint_;
  bool observing_ = false;

  base::WeakPtrFactory<RpcServer> weak_factory_{this};
};

}  // namespace redrob

#endif  // CHROME_BROWSER_REDROB_RPC_SERVER_H_
