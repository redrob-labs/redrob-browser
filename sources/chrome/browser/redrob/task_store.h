// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_REDROB_TASK_STORE_H_
#define CHROME_BROWSER_REDROB_TASK_STORE_H_

#include <map>
#include <memory>
#include <string>
#include <vector>

#include "base/memory/raw_ptr.h"
#include "base/observer_list.h"
#include "base/timer/timer.h"
#include "base/values.h"
#include "chrome/browser/redrob/sidecar_client.h"
#include "chrome/browser/ui/webui/redrob/redrob.mojom.h"
#include "components/keyed_service/core/keyed_service.h"
#include "services/network/public/cpp/shared_url_loader_factory.h"

class Profile;

namespace redrob {

// The tasks of one profile, the sidecar that answers them, and the tool loop between the two.
//
// This is a profile service rather than state on the WebUI's Mojo handler, and that is the whole
// point: a task opens as a TAB. Navigating creates a new document, a new handler and -- when the
// tasks lived on the handler -- a new empty list, so the task tab you had just opened said "task not
// found". Tasks outlive documents because the product treats them as something you go back to.
//
// The engine does inference and proposes tools; THIS class runs them. That division is the engine's
// own contract for this endpoint ("leaving dynamic tool execution to the calling UI"), and it is also
// the security boundary: the browser decides what a model's output is allowed to make the browser do,
// and it decides it here, in one place, in the browser process.
class TaskStore : public KeyedService, public SidecarClient::CompletionDelegate {
 public:
  class Observer : public base::CheckedObserver {
   public:
    virtual void OnTaskChanged(const mojom::Task& task) = 0;
  };

  TaskStore(Profile* profile,
            scoped_refptr<network::SharedURLLoaderFactory> url_loader_factory);
  TaskStore(const TaskStore&) = delete;
  TaskStore& operator=(const TaskStore&) = delete;
  ~TaskStore() override;

  void AddObserver(Observer* observer);
  void RemoveObserver(Observer* observer);

  // Returns the new task's id, or the reason it could not start. Every argument came from a renderer,
  // so this is where the bounds live.
  std::pair<std::optional<std::string>, std::optional<mojom::StartError>> StartTask(
      const std::string& prompt,
      const std::vector<std::string>& context_refs);
  void CancelTask(const std::string& task_id);
  bool Reply(const std::string& task_id, const std::string& prompt);
  std::vector<mojom::TaskPtr> ListTasks() const;
  mojom::TaskPtr GetTask(const std::string& task_id) const;
  bool SetRouting(mojom::RoutingMode mode);

  // SidecarClient::CompletionDelegate
  void OnCompletionText(std::string_view text) override;
  void OnCompletionReasoning(std::string_view text) override;
  void OnCompletionToolCall(const std::string& id,
                            const std::string& name,
                            const std::string& arguments_json) override;
  void OnCompletionFinished(const std::string& finish_reason) override;
  void OnCompletionFailed(const std::string& message) override;

 private:
  // What the engine proposed, held until the turn ends. Tools are run only after a turn completes: a
  // tool call whose arguments arrived in a stream that then failed is one the browser must not run.
  struct ProposedToolCall {
    std::string id;
    std::string name;
    std::string arguments_json;
  };

  // The wire history of one task. Kept out of mojom::Task deliberately -- a renderer has no business
  // seeing raw system prompts or tool plumbing, only the trace built from them.
  struct Conversation {
    base::ListValue messages;
    int tool_rounds = 0;
    std::string assistant_text;
    std::vector<ProposedToolCall> proposed;
  };

  void OnSidecarStatusChanged(SidecarClient::Status status);
  void StartTurn(const std::string& task_id);
  // Runs one proposed call, returns what the engine is told about the outcome. A refusal is reported
  // back to the engine as a result rather than hidden, so it can react instead of retrying blindly.
  std::string RunTool(const std::string& task_id, const ProposedToolCall& call);
  void FinishTask(const std::string& task_id, mojom::TaskState state, const std::string& error);
  mojom::Step* AddStep(const std::string& task_id, mojom::StepKind kind, const std::string& label);
  void AddStepDetail(const std::string& task_id, const std::string& text, const std::string& source);
  void Notify(const std::string& task_id);
  // Prose arrives token by token; a Mojo message per token would send the whole task hundreds of times
  // for one paragraph. Coalesced so the page updates promptly without that traffic.
  void ScheduleNotify(const std::string& task_id);

  std::map<std::string, mojom::TaskPtr> tasks_;
  std::map<std::string, Conversation> conversations_;
  // The task whose turn the sidecar is currently answering. Only one runs at a time because one client
  // holds one stream; queueing is what kMaxConcurrentTasks bounds.
  std::string active_task_id_;
  mojom::RoutingMode routing_ = mojom::RoutingMode::kLocal;
  raw_ptr<Profile> profile_;
  scoped_refptr<network::SharedURLLoaderFactory> url_loader_factory_;
  std::unique_ptr<SidecarClient> sidecar_;
  base::OneShotTimer notify_timer_;
  std::string pending_notify_task_id_;
  base::ObserverList<Observer> observers_;
};

}  // namespace redrob

#endif  // CHROME_BROWSER_REDROB_TASK_STORE_H_
