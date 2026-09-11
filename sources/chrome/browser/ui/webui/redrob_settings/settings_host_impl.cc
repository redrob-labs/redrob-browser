// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/ui/webui/redrob_settings/settings_host_impl.h"

#include <utility>

#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/redrob/agent_service_factories.h"
#include "chrome/browser/redrob/memory_store.h"
#include "chrome/browser/redrob/model_store.h"
#include "chrome/browser/redrob/redrob_prefs.h"
#include "chrome/browser/redrob/routine_store.h"
#include "chrome/browser/redrob/task_store.h"
#include "chrome/browser/redrob/task_store_factory.h"
#include "chrome/browser/ui/navigator/browser_navigator.h"
#include "chrome/browser/ui/navigator/browser_navigator_params.h"
#include "chrome/browser/ui/select_file_policy/chrome_select_file_policy.h"
#include "chrome/common/webui_url_constants.h"
#include "components/password_manager/core/common/password_manager_pref_names.h"
#include "components/prefs/pref_service.h"
#include "content/public/browser/web_contents.h"
#include "ui/shell_dialogs/selected_file_info.h"

namespace redrob {
namespace {

settings::mojom::PermissionMode ToWireMode(mojom::PermissionMode mode) {
  switch (mode) {
    case mojom::PermissionMode::kReadOnly:
      return settings::mojom::PermissionMode::kReadOnly;
    case mojom::PermissionMode::kFullAccess:
      return settings::mojom::PermissionMode::kFullAccess;
    case mojom::PermissionMode::kGuard:
      return settings::mojom::PermissionMode::kGuard;
  }
}

mojom::PermissionMode FromWireMode(settings::mojom::PermissionMode mode) {
  switch (mode) {
    case settings::mojom::PermissionMode::kReadOnly:
      return mojom::PermissionMode::kReadOnly;
    case settings::mojom::PermissionMode::kFullAccess:
      return mojom::PermissionMode::kFullAccess;
    case settings::mojom::PermissionMode::kGuard:
      return mojom::PermissionMode::kGuard;
  }
}

settings::mojom::Effort ToWireEffort(mojom::Effort effort) {
  switch (effort) {
    case mojom::Effort::kQuick:
      return settings::mojom::Effort::kQuick;
    case mojom::Effort::kUltrabrowse:
      return settings::mojom::Effort::kUltrabrowse;
    case mojom::Effort::kStandard:
      return settings::mojom::Effort::kStandard;
  }
}

mojom::Effort FromWireEffort(settings::mojom::Effort effort) {
  switch (effort) {
    case settings::mojom::Effort::kQuick:
      return mojom::Effort::kQuick;
    case settings::mojom::Effort::kUltrabrowse:
      return mojom::Effort::kUltrabrowse;
    case settings::mojom::Effort::kStandard:
      return mojom::Effort::kStandard;
  }
}

settings::mojom::RoutinePtr ToWireRoutine(const RoutineStore::Routine& routine) {
  settings::mojom::RoutinePtr wire = settings::mojom::Routine::New();
  wire->id = routine.id;
  wire->title = routine.title;
  wire->prompt = routine.prompt;
  wire->kind = routine.kind == RoutineStore::Kind::kHeartbeat
                   ? settings::mojom::RoutineKind::kHeartbeat
                   : settings::mojom::RoutineKind::kCron;
  wire->every_minutes = routine.every_minutes;
  wire->mode = ToWireMode(routine.mode);
  wire->effort = ToWireEffort(routine.effort);
  wire->enabled = routine.enabled;
  wire->task_id = routine.task_id;
  wire->last_run_ms = static_cast<double>(routine.last_run_ms);
  wire->next_run_ms = static_cast<double>(routine.next_run_ms);
  wire->last_error = routine.last_error;
  return wire;
}

RoutineStore::Routine FromWireRoutine(const settings::mojom::Routine& wire) {
  RoutineStore::Routine routine;
  routine.id = wire.id;
  routine.title = wire.title;
  routine.prompt = wire.prompt;
  routine.kind = wire.kind == settings::mojom::RoutineKind::kHeartbeat
                     ? RoutineStore::Kind::kHeartbeat
                     : RoutineStore::Kind::kCron;
  routine.every_minutes = wire.every_minutes;
  routine.mode = FromWireMode(wire.mode);
  routine.effort = FromWireEffort(wire.effort);
  routine.enabled = wire.enabled;
  routine.task_id = wire.task_id;
  return routine;
}

}  // namespace

SettingsHostImpl::SettingsHostImpl(
    mojo::PendingReceiver<settings::mojom::SettingsHost> receiver,
    Profile* profile,
    content::WebContents* web_contents)
    : receiver_(this, std::move(receiver)),
      profile_(profile),
      web_contents_(web_contents) {}

SettingsHostImpl::~SettingsHostImpl() {
  if (folder_dialog_) {
    folder_dialog_->ListenerDestroyed();
  }
}

void SettingsHostImpl::GetSettings(GetSettingsCallback callback) {
  settings::mojom::AgentSettingsPtr out = settings::mojom::AgentSettings::New();

  const base::FilePath folder = profile_->GetPrefs()->GetFilePath(prefs::kWorkingFolder);
  out->working_folder = folder.empty() ? std::string() : folder.BaseName().AsUTF8Unsafe();

  MemoryStore* memory = MemoryStoreFactory::GetForProfile(profile_);
  out->memory = settings::mojom::MemorySettings::New();
  out->memory->enabled = memory->enabled();
  out->memory->retention_days = memory->retention_days();
  for (const MemoryStore::Entry& entry : memory->List()) {
    settings::mojom::MemoryEntryPtr wire = settings::mojom::MemoryEntry::New();
    wire->id = entry.id;
    wire->text = entry.text;
    wire->source = entry.source;
    wire->created_ms = static_cast<double>(entry.created_at_ms);
    wire->pinned = entry.pinned;
    out->memory->entries.push_back(std::move(wire));
  }

  ModelStore* model = ModelStoreFactory::GetForProfile(profile_);
  out->model = settings::mojom::ModelSettings::New();
  out->model->selected_id = model->selected_id();
  out->model->encryption_ready = model->encryption_ready();
  for (const ModelStore::Provider& provider : model->List()) {
    settings::mojom::ProviderPtr wire = settings::mojom::Provider::New();
    wire->id = provider.id;
    wire->label = provider.label;
    wire->model = provider.model;
    wire->endpoint = provider.endpoint;
    wire->has_secret = provider.has_secret;
    out->model->providers.push_back(std::move(wire));
  }

  PrefService* prefs = profile_->GetPrefs();
  out->passwords = settings::mojom::PasswordSettings::New();
  out->passwords->offer_to_save =
      prefs->GetBoolean(password_manager::prefs::kCredentialsEnableService);
  out->passwords->auto_signin =
      prefs->GetBoolean(password_manager::prefs::kCredentialsEnableAutosignin);
  out->passwords->choice = prefs->GetString(prefs::kPasswordManagerChoice);

  for (const RoutineStore::Routine& routine :
       RoutineStoreFactory::GetForProfile(profile_)->List()) {
    out->routines.push_back(ToWireRoutine(routine));
  }

  // The chats a heartbeat routine could be pointed at. Only non-empty prompts, and only this profile's.
  for (const mojom::TaskPtr& task : TaskStoreFactory::GetForProfile(profile_)->ListTasks()) {
    settings::mojom::ChatSummaryPtr chat = settings::mojom::ChatSummary::New();
    chat->id = task->id;
    chat->prompt = task->prompt;
    out->chats.push_back(std::move(chat));
  }

  std::move(callback).Run(std::move(out));
}

void SettingsHostImpl::AddRoutine(settings::mojom::RoutinePtr routine,
                                  AddRoutineCallback callback) {
  const std::string id =
      RoutineStoreFactory::GetForProfile(profile_)->Add(FromWireRoutine(*routine));
  std::move(callback).Run(id.empty() ? std::nullopt : std::optional<std::string>(id));
}

void SettingsHostImpl::UpdateRoutine(settings::mojom::RoutinePtr routine,
                                     UpdateRoutineCallback callback) {
  std::move(callback).Run(
      RoutineStoreFactory::GetForProfile(profile_)->Update(FromWireRoutine(*routine)));
}

void SettingsHostImpl::RemoveRoutine(const std::string& id, RemoveRoutineCallback callback) {
  std::move(callback).Run(RoutineStoreFactory::GetForProfile(profile_)->Remove(id));
}

void SettingsHostImpl::SetRoutineEnabled(const std::string& id,
                                         bool enabled,
                                         SetRoutineEnabledCallback callback) {
  std::move(callback).Run(
      RoutineStoreFactory::GetForProfile(profile_)->SetEnabled(id, enabled));
}

void SettingsHostImpl::RunRoutineNow(const std::string& id, RunRoutineNowCallback callback) {
  const std::string task_id = RoutineStoreFactory::GetForProfile(profile_)->RunNow(id);
  std::move(callback).Run(task_id.empty() ? std::nullopt
                                        : std::optional<std::string>(task_id));
}

void SettingsHostImpl::SetMemoryEnabled(bool enabled) {
  MemoryStoreFactory::GetForProfile(profile_)->SetEnabled(enabled);
}

void SettingsHostImpl::SetMemoryRetentionDays(int32_t days) {
  MemoryStoreFactory::GetForProfile(profile_)->SetRetentionDays(days);
}

void SettingsHostImpl::RemoveMemory(const std::string& id, RemoveMemoryCallback callback) {
  std::move(callback).Run(MemoryStoreFactory::GetForProfile(profile_)->Remove(id));
}

void SettingsHostImpl::SetMemoryPinned(const std::string& id,
                                       bool pinned,
                                       SetMemoryPinnedCallback callback) {
  std::move(callback).Run(MemoryStoreFactory::GetForProfile(profile_)->SetPinned(id, pinned));
}

void SettingsHostImpl::ForgetEverything() {
  MemoryStoreFactory::GetForProfile(profile_)->Clear();
}

void SettingsHostImpl::AddProvider(const std::string& label,
                                   const std::string& model,
                                   const std::string& endpoint,
                                   const std::string& secret,
                                   AddProviderCallback callback) {
  const std::string id =
      ModelStoreFactory::GetForProfile(profile_)->Add(label, model, endpoint, secret);
  std::move(callback).Run(id.empty() ? std::nullopt : std::optional<std::string>(id));
}

void SettingsHostImpl::RemoveProvider(const std::string& id, RemoveProviderCallback callback) {
  std::move(callback).Run(ModelStoreFactory::GetForProfile(profile_)->Remove(id));
}

void SettingsHostImpl::SelectProvider(const std::string& id, SelectProviderCallback callback) {
  std::move(callback).Run(ModelStoreFactory::GetForProfile(profile_)->Select(id));
}

void SettingsHostImpl::SetOfferToSavePasswords(bool enabled) {
  profile_->GetPrefs()->SetBoolean(password_manager::prefs::kCredentialsEnableService, enabled);
}

void SettingsHostImpl::SetPasswordAutoSignin(bool enabled) {
  profile_->GetPrefs()->SetBoolean(password_manager::prefs::kCredentialsEnableAutosignin,
                                   enabled);
}

void SettingsHostImpl::SetPasswordManagerChoice(const std::string& choice) {
  // Three known values and nothing else: this arrives from a renderer and ends up rendered back.
  if (choice != "redrob" && choice != "external" && choice != "skip") {
    return;
  }
  profile_->GetPrefs()->SetString(prefs::kPasswordManagerChoice, choice);
  // "I use another manager" means stop offering to save. It does NOT mean Chromium forgets the
  // credentials it already has, and the page says so rather than implying a migration happened.
  if (choice == "external") {
    profile_->GetPrefs()->SetBoolean(password_manager::prefs::kCredentialsEnableService, false);
  }
}

void SettingsHostImpl::OpenPasswordManager() {
  if (!web_contents_) {
    return;
  }
  NavigateParams params(profile_, GURL(chrome::kChromeUIPasswordManagerURL),
                        ui::PAGE_TRANSITION_AUTO_BOOKMARK);
  params.disposition = WindowOpenDisposition::SINGLETON_TAB;
  Navigate(&params);
}

void SettingsHostImpl::ChooseWorkingFolder(ChooseWorkingFolderCallback callback) {
  if (folder_dialog_ || !web_contents_) {
    std::move(callback).Run(std::nullopt);
    return;
  }
  folder_dialog_callback_ = std::move(callback);
  folder_dialog_ = ui::SelectFileDialog::Create(
      this, std::make_unique<ChromeSelectFilePolicy>(web_contents_));
  if (!folder_dialog_) {
    // No portal and no toolkit -- answer rather than leave the button dead.
    std::move(folder_dialog_callback_).Run(std::nullopt);
    return;
  }
  ui::SelectFileDialog::FileTypeInfo info;
  info.allowed_paths = ui::SelectFileDialog::FileTypeInfo::NATIVE_PATH;
  folder_dialog_->SelectFile(ui::SelectFileDialog::SELECT_FOLDER,
                            u"Choose the folder agent tasks may write into", base::FilePath(),
                            &info, 0, base::FilePath::StringType(),
                            web_contents_->GetTopLevelNativeWindow(), nullptr);
}

void SettingsHostImpl::ClearWorkingFolder() {
  profile_->GetPrefs()->SetFilePath(prefs::kWorkingFolder, base::FilePath());
}

void SettingsHostImpl::FileSelected(const ui::SelectedFileInfo& file, int index) {
  folder_dialog_ = nullptr;
  if (!folder_dialog_callback_) {
    return;
  }
  if (file.path().empty() || !file.path().IsAbsolute()) {
    std::move(folder_dialog_callback_).Run(std::nullopt);
    return;
  }
  profile_->GetPrefs()->SetFilePath(prefs::kWorkingFolder, file.path());
  std::move(folder_dialog_callback_).Run(file.path().BaseName().AsUTF8Unsafe());
}

void SettingsHostImpl::FileSelectionCanceled() {
  folder_dialog_ = nullptr;
  if (folder_dialog_callback_) {
    std::move(folder_dialog_callback_).Run(std::nullopt);
  }
}

}  // namespace redrob
