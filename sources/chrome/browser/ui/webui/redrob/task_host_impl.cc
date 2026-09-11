// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/ui/webui/redrob/task_host_impl.h"

#include <utility>

namespace redrob {

TaskHostImpl::TaskHostImpl(mojo::PendingReceiver<mojom::TaskHost> receiver,
                           mojo::PendingRemote<mojom::Page> page,
                           TaskStore* store)
    : receiver_(this, std::move(receiver)), page_(std::move(page)), store_(store) {
  store_->AddObserver(this);
}

TaskHostImpl::~TaskHostImpl() {
  store_->RemoveObserver(this);
}

void TaskHostImpl::StartTask(const std::string& prompt,
                             const std::vector<std::string>& context_refs,
                             mojom::PermissionMode mode,
                             StartTaskCallback callback) {
  auto [task_id, error] = store_->StartTask(prompt, context_refs, mode);
  std::move(callback).Run(std::move(task_id), std::move(error));
}

void TaskHostImpl::CancelTask(const std::string& task_id) {
  store_->CancelTask(task_id);
}

void TaskHostImpl::ListTasks(ListTasksCallback callback) {
  std::move(callback).Run(store_->ListTasks());
}

void TaskHostImpl::GetTask(const std::string& task_id, GetTaskCallback callback) {
  // A null answer rather than an error: the task tab's URL is a string a renderer can put anything
  // in, including the id of a task from a previous browser session.
  std::move(callback).Run(store_->GetTask(task_id));
}

void TaskHostImpl::Reply(const std::string& task_id,
                         const std::string& prompt,
                         ReplyCallback callback) {
  std::move(callback).Run(store_->Reply(task_id, prompt));
}

void TaskHostImpl::SetPermissionMode(const std::string& task_id,
                                    mojom::PermissionMode mode,
                                    SetPermissionModeCallback callback) {
  std::move(callback).Run(store_->SetPermissionMode(task_id, mode));
}

void TaskHostImpl::ChooseWorkingFolder(const std::string& task_id,
                                       ChooseWorkingFolderCallback callback) {
  store_->ChooseWorkingFolder(task_id, std::move(callback));
}

void TaskHostImpl::OnTaskChanged(const mojom::Task& task) {
  if (page_.is_bound()) {
    page_->OnTaskChanged(task.Clone());
  }
}

}  // namespace redrob
