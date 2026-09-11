// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_UI_WEBUI_REDROB_SETTINGS_SETTINGS_HOST_IMPL_H_
#define CHROME_BROWSER_UI_WEBUI_REDROB_SETTINGS_SETTINGS_HOST_IMPL_H_

#include <string>

#include "base/memory/raw_ptr.h"
#include "base/memory/scoped_refptr.h"
#include "chrome/browser/ui/webui/redrob_settings/redrob_settings.mojom.h"
#include "mojo/public/cpp/bindings/receiver.h"
#include "ui/shell_dialogs/select_file_dialog.h"

class Profile;

namespace content {
class WebContents;
}  // namespace content

namespace redrob {

// The settings page's endpoint. Reads and writes the profile's stores; holds no state of its own
// except the folder dialog, which needs a window and therefore has to live on this side.
class SettingsHostImpl : public settings::mojom::SettingsHost,
                         public ui::SelectFileDialog::Listener {
 public:
  SettingsHostImpl(mojo::PendingReceiver<settings::mojom::SettingsHost> receiver,
                   Profile* profile,
                   content::WebContents* web_contents);
  SettingsHostImpl(const SettingsHostImpl&) = delete;
  SettingsHostImpl& operator=(const SettingsHostImpl&) = delete;
  ~SettingsHostImpl() override;

  // settings::mojom::SettingsHost
  void GetSettings(GetSettingsCallback callback) override;
  void AddRoutine(settings::mojom::RoutinePtr routine,
                  AddRoutineCallback callback) override;
  void UpdateRoutine(settings::mojom::RoutinePtr routine,
                     UpdateRoutineCallback callback) override;
  void RemoveRoutine(const std::string& id, RemoveRoutineCallback callback) override;
  void SetRoutineEnabled(const std::string& id,
                         bool enabled,
                         SetRoutineEnabledCallback callback) override;
  void RunRoutineNow(const std::string& id, RunRoutineNowCallback callback) override;
  void SetMemoryEnabled(bool enabled) override;
  void SetMemoryRetentionDays(int32_t days) override;
  void RemoveMemory(const std::string& id, RemoveMemoryCallback callback) override;
  void SetMemoryPinned(const std::string& id,
                       bool pinned,
                       SetMemoryPinnedCallback callback) override;
  void ForgetEverything() override;
  void AddProvider(const std::string& label,
                   const std::string& model,
                   const std::string& endpoint,
                   const std::string& secret,
                   AddProviderCallback callback) override;
  void RemoveProvider(const std::string& id, RemoveProviderCallback callback) override;
  void SelectProvider(const std::string& id, SelectProviderCallback callback) override;
  void SetOfferToSavePasswords(bool enabled) override;
  void SetPasswordAutoSignin(bool enabled) override;
  void SetPasswordManagerChoice(const std::string& choice) override;
  void OpenPasswordManager() override;
  void ChooseWorkingFolder(ChooseWorkingFolderCallback callback) override;
  void ClearWorkingFolder() override;

  // ui::SelectFileDialog::Listener
  void FileSelected(const ui::SelectedFileInfo& file, int index) override;
  void FileSelectionCanceled() override;

 private:
  mojo::Receiver<settings::mojom::SettingsHost> receiver_;
  raw_ptr<Profile> profile_;
  raw_ptr<content::WebContents> web_contents_;

  scoped_refptr<ui::SelectFileDialog> folder_dialog_;
  ChooseWorkingFolderCallback folder_dialog_callback_;
};

}  // namespace redrob

#endif  // CHROME_BROWSER_UI_WEBUI_REDROB_SETTINGS_SETTINGS_HOST_IMPL_H_
