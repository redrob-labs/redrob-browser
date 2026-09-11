// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/ui/webui/redrob/task_host_impl.h"

#include <utility>

#include "chrome/browser/ui/select_file_policy/chrome_select_file_policy.h"
#include "content/public/browser/web_contents.h"
#include "ui/shell_dialogs/selected_file_info.h"

namespace redrob {

TaskHostImpl::TaskHostImpl(mojo::PendingReceiver<mojom::TaskHost> receiver,
                           mojo::PendingRemote<mojom::Page> page,
                           TaskStore* store,
                           content::WebContents* web_contents)
    : receiver_(this, std::move(receiver)),
      page_(std::move(page)),
      store_(store),
      web_contents_(web_contents) {
  store_->AddObserver(this);
}

TaskHostImpl::~TaskHostImpl() {
  store_->RemoveObserver(this);
  if (folder_dialog_) {
    folder_dialog_->ListenerDestroyed();
  }
}

void TaskHostImpl::StartTask(const std::string& prompt,
                             const std::vector<std::string>& context_refs,
                             mojom::PermissionMode mode,
                             mojom::Effort effort,
                             StartTaskCallback callback) {
  auto [task_id, error] = store_->StartTask(prompt, context_refs, mode, effort);
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

void TaskHostImpl::SendFollowUp(const std::string& task_id,
                                const std::string& prompt,
                                mojom::FollowUpMode mode,
                                SendFollowUpCallback callback) {
  std::move(callback).Run(store_->SendFollowUp(task_id, prompt, mode));
}

void TaskHostImpl::SetPermissionMode(const std::string& task_id,
                                    mojom::PermissionMode mode,
                                    SetPermissionModeCallback callback) {
  std::move(callback).Run(store_->SetPermissionMode(task_id, mode));
}

void TaskHostImpl::ChooseWorkingFolder(const std::string& task_id,
                                       ChooseWorkingFolderCallback callback) {
  // A renderer can send this twice. The second one is answered rather than left hanging, and it does
  // not get a second dialog: a page that can stack native modals on a window is a page that can make
  // the browser unusable.
  if (folder_dialog_ || !web_contents_) {
    std::move(callback).Run(std::nullopt);
    return;
  }
  folder_dialog_task_id_ = task_id;
  folder_dialog_callback_ = std::move(callback);
  folder_dialog_ = ui::SelectFileDialog::Create(
      this, std::make_unique<ChromeSelectFilePolicy>(web_contents_));
  // Nullable, and on purpose: on Linux the factory returns nothing when there is neither an
  // xdg-desktop-portal nor a toolkit to ask -- a headless container, for instance. Answering the call
  // is what keeps the page's button honest instead of leaving a promise nothing will ever resolve.
  if (!folder_dialog_) {
    folder_dialog_task_id_.clear();
    std::move(folder_dialog_callback_).Run(std::nullopt);
    return;
  }
  ui::SelectFileDialog::FileTypeInfo info;
  info.allowed_paths = ui::SelectFileDialog::FileTypeInfo::NATIVE_PATH;
  // No default path from the renderer, and no default path from the last choice either: the dialog's
  // own idea of where to start is the platform's, and pre-seeding it with a folder the page named
  // would let a page steer the picker.
  folder_dialog_->SelectFile(ui::SelectFileDialog::SELECT_FOLDER,
                            u"Choose the folder this task may write into", base::FilePath(), &info,
                            0, base::FilePath::StringType(),
                            web_contents_->GetTopLevelNativeWindow(), nullptr);
}

void TaskHostImpl::FileSelected(const ui::SelectedFileInfo& file, int index) {
  folder_dialog_ = nullptr;
  const std::string task_id = folder_dialog_task_id_;
  folder_dialog_task_id_.clear();
  if (!folder_dialog_callback_) {
    return;
  }
  // The store decides whether this is acceptable and what the page is allowed to be told about it --
  // the display name only, never the path.
  std::move(folder_dialog_callback_).Run(store_->SetWorkingFolder(task_id, file.path()));
}

void TaskHostImpl::FileSelectionCanceled() {
  folder_dialog_ = nullptr;
  folder_dialog_task_id_.clear();
  if (folder_dialog_callback_) {
    std::move(folder_dialog_callback_).Run(std::nullopt);
  }
}

void TaskHostImpl::OnTaskChanged(const mojom::Task& task) {
  if (page_.is_bound()) {
    page_->OnTaskChanged(task.Clone());
  }
}

}  // namespace redrob
