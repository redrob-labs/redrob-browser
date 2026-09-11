// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_UI_WEBUI_REDROB_TASK_HOST_IMPL_H_
#define CHROME_BROWSER_UI_WEBUI_REDROB_TASK_HOST_IMPL_H_

#include <string>
#include <vector>

#include "base/memory/raw_ptr.h"
#include "chrome/browser/redrob/task_store.h"
#include "chrome/browser/ui/webui/redrob/redrob.mojom.h"
#include "mojo/public/cpp/bindings/receiver.h"
#include "mojo/public/cpp/bindings/remote.h"

namespace redrob {

// Per-document Mojo endpoint for chrome://redrob. Deliberately thin: it validates nothing and stores
// nothing, because both belong to the profile's TaskStore -- a task opens as a tab, so its state has
// to outlive the document that started it.
//
// Every method here is reachable from a renderer. The bounds are in TaskStore so that a second
// surface (an agent tab, a side panel) cannot get a laxer version of them by talking to the store
// through a different handler.
class TaskHostImpl : public mojom::TaskHost, public TaskStore::Observer {
 public:
  TaskHostImpl(mojo::PendingReceiver<mojom::TaskHost> receiver,
               mojo::PendingRemote<mojom::Page> page,
               TaskStore* store);
  TaskHostImpl(const TaskHostImpl&) = delete;
  TaskHostImpl& operator=(const TaskHostImpl&) = delete;
  ~TaskHostImpl() override;

  // mojom::TaskHost
  void StartTask(const std::string& prompt,
                 const std::vector<std::string>& context_refs,
                 mojom::PermissionMode mode,
                 StartTaskCallback callback) override;
  void CancelTask(const std::string& task_id) override;
  void ListTasks(ListTasksCallback callback) override;
  void GetTask(const std::string& task_id, GetTaskCallback callback) override;
  void Reply(const std::string& task_id,
             const std::string& prompt,
             ReplyCallback callback) override;
  void SetPermissionMode(const std::string& task_id,
                        mojom::PermissionMode mode,
                        SetPermissionModeCallback callback) override;
  void ChooseWorkingFolder(const std::string& task_id,
                          ChooseWorkingFolderCallback callback) override;

  // TaskStore::Observer
  void OnTaskChanged(const mojom::Task& task) override;

 private:
  mojo::Receiver<mojom::TaskHost> receiver_;
  mojo::Remote<mojom::Page> page_;
  raw_ptr<TaskStore> store_;
};

}  // namespace redrob

#endif  // CHROME_BROWSER_UI_WEBUI_REDROB_TASK_HOST_IMPL_H_
