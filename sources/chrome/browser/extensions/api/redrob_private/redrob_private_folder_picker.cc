// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/extensions/api/redrob_private/redrob_private_folder_picker.h"

#include <memory>
#include <utility>

#include "chrome/browser/ui/select_file_policy/chrome_select_file_policy.h"
#include "content/public/browser/web_contents.h"
#include "ui/shell_dialogs/selected_file_info.h"

namespace extensions {

// static
void RedrobPrivateFolderPicker::Show(content::WebContents* web_contents,
                                     const std::u16string& title,
                                     ResultCallback callback) {
  if (!web_contents) {
    std::move(callback).Run(base::FilePath());
    return;
  }
  // Owns itself from here; Finish() deletes it.
  new RedrobPrivateFolderPicker(web_contents, title, std::move(callback));
}

RedrobPrivateFolderPicker::RedrobPrivateFolderPicker(
    content::WebContents* web_contents,
    const std::u16string& title,
    ResultCallback callback)
    : callback_(std::move(callback)) {
  dialog_ = ui::SelectFileDialog::Create(
      this, std::make_unique<ChromeSelectFilePolicy>(web_contents));
  if (!dialog_) {
    // No portal and no toolkit. Answer rather than leave the button dead.
    Finish(base::FilePath());
    return;
  }
  ui::SelectFileDialog::FileTypeInfo info;
  info.allowed_paths = ui::SelectFileDialog::FileTypeInfo::NATIVE_PATH;
  dialog_->SelectFile(ui::SelectFileDialog::SELECT_FOLDER, title,
                      base::FilePath(), &info, 0,
                      base::FilePath::StringType(),
                      web_contents->GetTopLevelNativeWindow(), nullptr);
}

RedrobPrivateFolderPicker::~RedrobPrivateFolderPicker() {
  if (dialog_) {
    dialog_->ListenerDestroyed();
  }
}

void RedrobPrivateFolderPicker::FileSelected(const ui::SelectedFileInfo& file,
                                             int index) {
  Finish(file.path());
}

void RedrobPrivateFolderPicker::FileSelectionCanceled() {
  Finish(base::FilePath());
}

void RedrobPrivateFolderPicker::Finish(const base::FilePath& path) {
  if (callback_) {
    std::move(callback_).Run(path);
  }
  delete this;
}

}  // namespace extensions
