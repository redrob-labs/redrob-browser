// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_UI_WEBUI_REDROB_TASK_HOST_IMPL_H_
#define CHROME_BROWSER_UI_WEBUI_REDROB_TASK_HOST_IMPL_H_

#include <string>
#include <vector>

#include "base/memory/raw_ptr.h"
#include "base/memory/scoped_refptr.h"
#include "chrome/browser/redrob/task_store.h"
#include "chrome/browser/ui/webui/redrob/redrob.mojom.h"
#include "mojo/public/cpp/bindings/receiver.h"
#include "mojo/public/cpp/bindings/remote.h"
#include "ui/shell_dialogs/select_file_dialog.h"

namespace content {
class WebContents;
}  // namespace content

namespace redrob {

// Per-document Mojo endpoint for chrome://redrob. Deliberately thin: it validates nothing and stores
// nothing, because both belong to the profile's TaskStore -- a task opens as a tab, so its state has
// to outlive the document that started it.
//
// Every method here is reachable from a renderer. The bounds are in TaskStore so that a second
// surface (an agent tab, a side panel) cannot get a laxer version of them by talking to the store
// through a different handler.
//
// The ONE thing this class does own is the folder picker. A native dialog needs a window to be modal
// to, and this is the only object in the chain that has one -- TaskStore is a profile service and has
// no business knowing which window a request came from.
class TaskHostImpl : public mojom::TaskHost,
                     public TaskStore::Observer,
                     public ui::SelectFileDialog::Listener {
 public:
  TaskHostImpl(mojo::PendingReceiver<mojom::TaskHost> receiver,
               mojo::PendingRemote<mojom::Page> page,
               TaskStore* store,
               content::WebContents* web_contents);
  TaskHostImpl(const TaskHostImpl&) = delete;
  TaskHostImpl& operator=(const TaskHostImpl&) = delete;
  ~TaskHostImpl() override;

  // mojom::TaskHost
  void StartTask(const std::string& prompt,
                 const std::vector<std::string>& context_refs,
                 mojom::PermissionMode mode,
                 mojom::Effort effort,
                 const std::string& model,
                 StartTaskCallback callback) override;
  void ListModels(ListModelsCallback callback) override;
  void CancelTask(const std::string& task_id) override;
  void ListTasks(ListTasksCallback callback) override;
  void GetTask(const std::string& task_id, GetTaskCallback callback) override;
  void SendFollowUp(const std::string& task_id,
                    const std::string& prompt,
                    mojom::FollowUpMode mode,
                    SendFollowUpCallback callback) override;
  void WithdrawQueuedFollowUp(const std::string& task_id,
                              uint32_t index,
                              const std::string& expected_prompt,
                              WithdrawQueuedFollowUpCallback callback) override;
  void SetPermissionMode(const std::string& task_id,
                        mojom::PermissionMode mode,
                        SetPermissionModeCallback callback) override;
  void ChooseWorkingFolder(const std::string& task_id,
                          ChooseWorkingFolderCallback callback) override;
  void SearchWithDefaultProvider(const std::string& query) override;

  // TaskStore::Observer
  void OnTaskChanged(const mojom::Task& task) override;

  // ui::SelectFileDialog::Listener
  void FileSelected(const ui::SelectedFileInfo& file, int index) override;
  void FileSelectionCanceled() override;

 private:
  mojo::Receiver<mojom::TaskHost> receiver_;
  mojo::Remote<mojom::Page> page_;
  raw_ptr<TaskStore> store_;
  raw_ptr<content::WebContents> web_contents_;

  // Held for the life of the dialog, which is what keeps it alive, and cleared in both listener
  // callbacks. One at a time: a second request while a picker is open is answered as a cancellation
  // rather than stacking dialogs on one window.
  scoped_refptr<ui::SelectFileDialog> folder_dialog_;
  std::string folder_dialog_task_id_;
  ChooseWorkingFolderCallback folder_dialog_callback_;
};

}  // namespace redrob

#endif  // CHROME_BROWSER_UI_WEBUI_REDROB_TASK_HOST_IMPL_H_
