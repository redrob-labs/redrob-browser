// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_FOLDER_PICKER_H_
#define CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_FOLDER_PICKER_H_

#include "base/files/file_path.h"
#include "base/functional/callback.h"
#include "base/memory/scoped_refptr.h"
#include "ui/shell_dialogs/select_file_dialog.h"

namespace content {
class WebContents;
}  // namespace content

namespace extensions {

// Asks the user for one folder and deletes itself once the dialog closes.
//
// This exists because a folder dialog outlives the call that opened it: the
// extension function has already returned RespondLater by the time the user
// picks anything. Modelled on upstream's FileEntryPicker, which solves the same
// lifetime problem for the file_system API — an object that owns the dialog,
// answers once, and then goes away.
class RedrobPrivateFolderPicker : public ui::SelectFileDialog::Listener {
 public:
  // An empty path means the user cancelled, or the platform had no dialog to
  // show. The callback runs exactly once.
  using ResultCallback = base::OnceCallback<void(const base::FilePath&)>;

  // Opens the dialog modal to `web_contents`'s window. `title` is what the
  // dialog asks for.
  static void Show(content::WebContents* web_contents,
                   const std::u16string& title,
                   ResultCallback callback);

  RedrobPrivateFolderPicker(const RedrobPrivateFolderPicker&) = delete;
  RedrobPrivateFolderPicker& operator=(const RedrobPrivateFolderPicker&) =
      delete;

 private:
  RedrobPrivateFolderPicker(content::WebContents* web_contents,
                            const std::u16string& title,
                            ResultCallback callback);
  ~RedrobPrivateFolderPicker() override;  // Deletes itself.

  // ui::SelectFileDialog::Listener
  void FileSelected(const ui::SelectedFileInfo& file, int index) override;
  void FileSelectionCanceled() override;

  void Finish(const base::FilePath& path);

  ResultCallback callback_;
  scoped_refptr<ui::SelectFileDialog> dialog_;
};

}  // namespace extensions

#endif  // CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_FOLDER_PICKER_H_
