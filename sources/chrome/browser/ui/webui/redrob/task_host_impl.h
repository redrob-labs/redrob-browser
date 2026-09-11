// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_UI_WEBUI_REDROB_TASK_HOST_IMPL_H_
#define CHROME_BROWSER_UI_WEBUI_REDROB_TASK_HOST_IMPL_H_

#include <map>
#include <memory>
#include <string>
#include <vector>

#include "chrome/browser/redrob/sidecar_client.h"
#include "chrome/browser/ui/webui/redrob/redrob.mojom.h"
#include "mojo/public/cpp/bindings/receiver.h"
#include "mojo/public/cpp/bindings/remote.h"

namespace redrob {

// Browser-process side of chrome://redrob. Owns the sidecar and the task list; runs no model itself.
//
// Every method here is reachable from a renderer, so each one treats its arguments as untrusted:
// prompts are length-capped, context refs are resolved rather than dereferenced, and a task id that
// does not exist is a no-op rather than a lookup failure worth reporting back.
class TaskHostImpl : public mojom::TaskHost {
 public:
  TaskHostImpl(mojo::PendingReceiver<mojom::TaskHost> receiver,
               mojo::PendingRemote<mojom::Page> page);
  TaskHostImpl(const TaskHostImpl&) = delete;
  TaskHostImpl& operator=(const TaskHostImpl&) = delete;
  ~TaskHostImpl() override;

  // mojom::TaskHost
  void StartTask(const std::string& prompt,
                 const std::vector<std::string>& context_refs,
                 StartTaskCallback callback) override;
  void CancelTask(const std::string& task_id) override;
  void ListTasks(ListTasksCallback callback) override;
  void SetRouting(mojom::RoutingMode mode, SetRoutingCallback callback) override;

 private:
  void OnSidecarStatusChanged(SidecarClient::Status status);
  void NotifyPage(const std::string& task_id);

  mojo::Receiver<mojom::TaskHost> receiver_;
  mojo::Remote<mojom::Page> page_;

  std::map<std::string, mojom::TaskPtr> tasks_;
  mojom::RoutingMode routing_ = mojom::RoutingMode::kLocal;
  std::unique_ptr<SidecarClient> sidecar_;
};

}  // namespace redrob

#endif  // CHROME_BROWSER_UI_WEBUI_REDROB_TASK_HOST_IMPL_H_
