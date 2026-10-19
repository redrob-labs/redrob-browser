// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/extensions/api/redrob_private/redrob_private_api.h"

#include <string>
#include <utility>
#include <vector>

#include "base/functional/bind.h"
#include "base/i18n/rtl.h"
#include "base/strings/utf_string_conversions.h"
#include "chrome/browser/extensions/api/redrob_private/redrob_private_engine_installer.h"
#include "chrome/browser/extensions/api/redrob_private/redrob_private_engine_installer_factory.h"
#include "chrome/browser/extensions/api/redrob_private/redrob_private_import_manager.h"
#include "chrome/browser/extensions/api/redrob_private/redrob_private_import_manager_factory.h"
#include "chrome/browser/extensions/api/redrob_private/redrob_private_onboarding_service.h"
#include "chrome/browser/extensions/api/redrob_private/redrob_private_onboarding_service_factory.h"
#include "chrome/browser/importer/importer_list.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/redrob/redrob_prefs.h"
#include "base/files/file_path.h"
#include "base/functional/bind.h"
#include "base/strings/utf_string_conversions.h"
#include "base/values.h"
#include "chrome/browser/extensions/api/redrob_private/redrob_private_folder_picker.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/redrob/agent_service_factories.h"
#include "chrome/browser/redrob/memory_store.h"
#include "chrome/browser/redrob/model_store.h"
#include "chrome/browser/redrob/oauth_flow.h"
#include "chrome/browser/redrob/redrob_prefs.h"
#include "chrome/browser/redrob/routine_store.h"
#include "chrome/browser/redrob/rpc_server.h"
#include "chrome/browser/redrob/sidecar_client.h"
#include "chrome/browser/redrob/task_store.h"
#include "chrome/browser/redrob/task_store_factory.h"
#include "chrome/browser/search_engines/template_url_service_factory.h"
#include "chrome/browser/themes/theme_service.h"
#include "chrome/browser/themes/theme_service_factory.h"
#include "chrome/browser/ui/navigator/browser_navigator.h"
#include "chrome/browser/ui/navigator/browser_navigator_params.h"
#include "chrome/browser/ui/webui/redrob/redrob.mojom.h"
#include "chrome/common/webui_url_constants.h"
#include "components/password_manager/core/common/password_manager_pref_names.h"
#include "components/prefs/pref_service.h"
#include "components/search_engines/template_url.h"
#include "components/search_engines/template_url_service.h"
#include "content/public/browser/web_contents.h"
#include "url/gurl.h"
#include "chrome/common/extensions/api/redrob_private.h"
#include "components/prefs/pref_service.h"
#include "components/user_data_importer/common/importer_data_types.h"
#include "components/version_info/version_info.h"

namespace extensions {

namespace redrob_private = api::redrob_private;

namespace {

// PA-3. The choice used to be written to a pref declared only here and registered
// nowhere, so Chromium dropped every write and the user's first-run pick did not
// survive the call that made it. The name now lives in redrob_prefs.h with every
// other pref, which is also the only way a settings screen can enumerate what the
// browser keeps.

// Only the choices the flow actually offers are stored. The value arrives from
// a renderer, and a pref that accepts arbitrary strings is a pref that will one
// day contain one.
bool IsKnownPasswordChoice(const std::string& choice) {
  return choice == "redrob" || choice == "external" || choice == "skip";
}

bool IsKnownModelChoice(const std::string& choice) {
  return choice == "redrob" || choice == "chatgpt" || choice == "claude";
}

}  // namespace
// The agent's stores and their factories all live in namespace redrob, and this
// file lives in namespace extensions, so every use of them needs the name
// brought in. One block here beats qualifying twenty-odd call sites, and
// keeps the ported bodies reading the same as the mojom host they came from.
using redrob::MemoryStore;
using redrob::MemoryStoreFactory;
using redrob::ModelStore;
using redrob::ModelStoreFactory;
using redrob::RoutineStore;
using redrob::RoutineStoreFactory;
using redrob::RpcServer;
using redrob::RpcServerFactory;
using redrob::SidecarClient;
using redrob::TaskStore;
using redrob::TaskStoreFactory;

ExtensionFunction::ResponseAction
RedrobPrivateGetBrowserVersionFunction::Run() {
  return RespondNow(ArgumentList(redrob_private::GetBrowserVersion::Results::Create(
      std::string(version_info::GetVersionNumber()))));
}

ExtensionFunction::ResponseAction
RedrobPrivateSetPasswordChoiceFunction::Run() {
  auto params = redrob_private::SetPasswordChoice::Params::Create(args());
  EXTENSION_FUNCTION_VALIDATE(params);
  if (IsKnownPasswordChoice(params->choice)) {
    // The registered pref the rest of the product reads -- Settings > Passwords
    // renders from this exact path.
    Profile::FromBrowserContext(browser_context())
        ->GetPrefs()
        ->SetString(redrob::prefs::kPasswordManagerChoice, params->choice);
  }
  return RespondNow(NoArguments());
}

ExtensionFunction::ResponseAction
RedrobPrivateSetMemoryEnabledFunction::Run() {
  auto params = redrob_private::SetMemoryEnabled::Params::Create(args());
  EXTENSION_FUNCTION_VALIDATE(params);
  MemoryStoreFactory::GetForProfile(
      Profile::FromBrowserContext(browser_context()))
      ->SetEnabled(params->enabled);
  return RespondNow(NoArguments());
}

ExtensionFunction::ResponseAction
RedrobPrivateSetModelChoiceFunction::Run() {
  auto params = redrob_private::SetModelChoice::Params::Create(args());
  EXTENSION_FUNCTION_VALIDATE(params);
  if (IsKnownModelChoice(params->choice)) {
    Profile::FromBrowserContext(browser_context())
        ->GetPrefs()
        ->SetString(redrob::prefs::kOnboardingModelChoice, params->choice);
  }
  return RespondNow(NoArguments());
}

RedrobPrivateGetImportSourcesFunction::RedrobPrivateGetImportSourcesFunction() =
    default;

RedrobPrivateGetImportSourcesFunction::~RedrobPrivateGetImportSourcesFunction() =
    default;

ExtensionFunction::ResponseAction
RedrobPrivateGetImportSourcesFunction::Run() {
  importer_list_ = std::make_unique<ImporterList>();
  // Detection reads other browsers' profile directories, so it is asynchronous.
  // `include_interactive_profiles` is false: a source that needs the user to do
  // something before it can be read does not belong in a list whose next button
  // says "Import".
  importer_list_->DetectSourceProfiles(
      base::i18n::GetConfiguredLocale(),
      /*include_interactive_profiles=*/false,
      base::BindOnce(&RedrobPrivateGetImportSourcesFunction::OnSourcesDetected,
                     this));
  // AddRef is held by the bound callback; released when it runs.
  return RespondLater();
}

void RedrobPrivateGetImportSourcesFunction::OnSourcesDetected() {
  std::vector<redrob_private::ImportSource> sources;
  for (size_t i = 0; i < importer_list_->count(); ++i) {
    const user_data_importer::SourceProfile& profile =
        importer_list_->GetSourceProfileAt(i);
    redrob_private::ImportSource source;
    source.name = base::UTF16ToUTF8(profile.importer_name);
    // Read from the source's OWN bitmask, one capability at a time.
    const uint16_t services = profile.services_supported;
    source.has_bookmarks = (services & user_data_importer::FAVORITES) != 0;
    source.has_history = (services & user_data_importer::HISTORY) != 0;
    source.has_passwords = (services & user_data_importer::PASSWORDS) != 0;
    source.has_search_engines =
        (services & user_data_importer::SEARCH_ENGINES) != 0;
    // Always false, and not an oversight: upstream defines a COOKIES bit and
    // comments it "not supported yet"; nothing implements it.
    source.has_cookies = false;
    sources.push_back(std::move(source));
  }
  Respond(ArgumentList(
      redrob_private::GetImportSources::Results::Create(sources)));
}

ExtensionFunction::ResponseAction RedrobPrivateStartImportFunction::Run() {
  auto params = redrob_private::StartImport::Params::Create(args());
  EXTENSION_FUNCTION_VALIDATE(params);
  // The manager owns the import and broadcasts onImportStateChanged; the
  // function returns immediately because the import outlives this call.
  RedrobPrivateImportManagerFactory::GetForBrowserContext(browser_context())
      ->StartImport(params->source_index);
  return RespondNow(NoArguments());
}

ExtensionFunction::ResponseAction
RedrobPrivateSetMemoryRetentionDaysFunction::Run() {
  auto params = redrob_private::SetMemoryRetentionDays::Params::Create(args());
  EXTENSION_FUNCTION_VALIDATE(params);
  MemoryStoreFactory::GetForProfile(
      Profile::FromBrowserContext(browser_context()))
      ->SetRetentionDays(params->days);
  return RespondNow(NoArguments());
}

ExtensionFunction::ResponseAction
RedrobPrivateCompleteOnboardingFunction::Run() {
  // Fires the closure the first-run window installed on the per-profile
  // onboarding service — mark first run done, tear the window down, open the
  // browser. A no-op when onboarding was opened as an ordinary tab (no window
  // registered a callback).
  RedrobPrivateOnboardingServiceFactory::GetForBrowserContext(browser_context())
      ->Complete();
  return RespondNow(NoArguments());
}

ExtensionFunction::ResponseAction
RedrobPrivateForgetAllMemoryFunction::Run() {
  MemoryStoreFactory::GetForProfile(
      Profile::FromBrowserContext(browser_context()))
      ->Clear();
  return RespondNow(NoArguments());
}

namespace {
Profile* ProfileOf(content::BrowserContext* ctx) {
  return Profile::FromBrowserContext(ctx);
}

redrob_private::PermissionMode ToPrivateMode(
    redrob::mojom::PermissionMode mode) {
  switch (mode) {
    case redrob::mojom::PermissionMode::kReadOnly:
      return redrob_private::PermissionMode::kReadOnly;
    case redrob::mojom::PermissionMode::kGuard:
      return redrob_private::PermissionMode::kGuard;
    case redrob::mojom::PermissionMode::kFullAccess:
      return redrob_private::PermissionMode::kFullAccess;
  }
  return redrob_private::PermissionMode::kGuard;
}

redrob_private::Effort ToPrivateEffort(redrob::mojom::Effort effort) {
  switch (effort) {
    case redrob::mojom::Effort::kQuick:
      return redrob_private::Effort::kQuick;
    case redrob::mojom::Effort::kStandard:
      return redrob_private::Effort::kStandard;
    case redrob::mojom::Effort::kUltrabrowse:
      return redrob_private::Effort::kUltrabrowse;
  }
  return redrob_private::Effort::kStandard;
}

// The other direction, for the routine a page sends back. Mirrors
// FromWireRoutine in the settings mojom host: lastRunMs, nextRunMs and
// lastError are reported OUT by getSettings and are the store's to set, so a
// routine arriving from a page cannot claim them.
redrob::mojom::PermissionMode FromPrivateMode(redrob_private::PermissionMode mode) {
  switch (mode) {
    case redrob_private::PermissionMode::kReadOnly:
      return redrob::mojom::PermissionMode::kReadOnly;
    case redrob_private::PermissionMode::kFullAccess:
      return redrob::mojom::PermissionMode::kFullAccess;
    case redrob_private::PermissionMode::kGuard:
    case redrob_private::PermissionMode::kNone:
      return redrob::mojom::PermissionMode::kGuard;
  }
  return redrob::mojom::PermissionMode::kGuard;
}

redrob::mojom::Effort FromPrivateEffort(redrob_private::Effort effort) {
  switch (effort) {
    case redrob_private::Effort::kQuick:
      return redrob::mojom::Effort::kQuick;
    case redrob_private::Effort::kUltrabrowse:
      return redrob::mojom::Effort::kUltrabrowse;
    case redrob_private::Effort::kStandard:
    case redrob_private::Effort::kNone:
      return redrob::mojom::Effort::kStandard;
  }
  return redrob::mojom::Effort::kStandard;
}

RoutineStore::Routine FromPrivateRoutine(const redrob_private::Routine& wire) {
  RoutineStore::Routine routine;
  routine.id = wire.id;
  routine.title = wire.title;
  routine.prompt = wire.prompt;
  routine.kind = wire.kind == redrob_private::RoutineKind::kHeartbeat
                     ? RoutineStore::Kind::kHeartbeat
                     : RoutineStore::Kind::kCron;
  routine.every_minutes = wire.every_minutes;
  routine.mode = FromPrivateMode(wire.mode);
  routine.effort = FromPrivateEffort(wire.effort);
  routine.enabled = wire.enabled;
  routine.task_id = wire.task_id;
  return routine;
}

// A-1: the agent's task types, outbound. The agent mojom's PermissionMode and
// Effort are the same enums the settings surface already maps, so ToPrivateMode
// and ToPrivateEffort above are reused rather than duplicated.
redrob_private::TaskState ToPrivateState(redrob::mojom::TaskState state) {
  switch (state) {
    case redrob::mojom::TaskState::kQueued:
      return redrob_private::TaskState::kQueued;
    case redrob::mojom::TaskState::kRunning:
      return redrob_private::TaskState::kRunning;
    case redrob::mojom::TaskState::kBlockedOnPolicy:
      return redrob_private::TaskState::kBlockedOnPolicy;
    case redrob::mojom::TaskState::kSucceeded:
      return redrob_private::TaskState::kSucceeded;
    case redrob::mojom::TaskState::kFailed:
      return redrob_private::TaskState::kFailed;
    case redrob::mojom::TaskState::kCancelled:
      return redrob_private::TaskState::kCancelled;
  }
  return redrob_private::TaskState::kFailed;
}

redrob_private::StepKind ToPrivateStepKind(redrob::mojom::StepKind kind) {
  switch (kind) {
    case redrob::mojom::StepKind::kThinking:
      return redrob_private::StepKind::kThinking;
    case redrob::mojom::StepKind::kSearchedMemory:
      return redrob_private::StepKind::kSearchedMemory;
    case redrob::mojom::StepKind::kOpenedPage:
      return redrob_private::StepKind::kOpenedPage;
    case redrob::mojom::StepKind::kCapturedScreenshot:
      return redrob_private::StepKind::kCapturedScreenshot;
    case redrob::mojom::StepKind::kReadPage:
      return redrob_private::StepKind::kReadPage;
    case redrob::mojom::StepKind::kClicked:
      return redrob_private::StepKind::kClicked;
    case redrob::mojom::StepKind::kTyped:
      return redrob_private::StepKind::kTyped;
    case redrob::mojom::StepKind::kSavedArtifact:
      return redrob_private::StepKind::kSavedArtifact;
    case redrob::mojom::StepKind::kRefused:
      return redrob_private::StepKind::kRefused;
    case redrob::mojom::StepKind::kUsedCredential:
      return redrob_private::StepKind::kUsedCredential;
    case redrob::mojom::StepKind::kSpawnedSubagents:
      return redrob_private::StepKind::kSpawnedSubagents;
    case redrob::mojom::StepKind::kSteered:
      return redrob_private::StepKind::kSteered;
    case redrob::mojom::StepKind::kQueuedMessage:
      return redrob_private::StepKind::kQueuedMessage;
    case redrob::mojom::StepKind::kPlanned:
      return redrob_private::StepKind::kPlanned;
    case redrob::mojom::StepKind::kRoutine:
      return redrob_private::StepKind::kRoutine;
    case redrob::mojom::StepKind::kNeedsConfirmation:
      return redrob_private::StepKind::kNeedsConfirmation;
  }
  // A step kind this build does not know is still a step that happened, so it
  // is reported as thinking rather than dropped from the record.
  return redrob_private::StepKind::kThinking;
}


redrob_private::StartError ToPrivateStartError(redrob::mojom::StartError error) {
  switch (error) {
    case redrob::mojom::StartError::kEmptyPrompt:
      return redrob_private::StartError::kEmptyPrompt;
    case redrob::mojom::StartError::kSidecarUnavailable:
      return redrob_private::StartError::kSidecarUnavailable;
    case redrob::mojom::StartError::kTooManyRunningTasks:
      return redrob_private::StartError::kTooManyRunningTasks;
  }
  return redrob_private::StartError::kSidecarUnavailable;
}

redrob_private::FollowUpOutcome ToPrivateOutcome(
    redrob::mojom::FollowUpOutcome outcome) {
  switch (outcome) {
    case redrob::mojom::FollowUpOutcome::kStartedTurn:
      return redrob_private::FollowUpOutcome::kStartedTurn;
    case redrob::mojom::FollowUpOutcome::kInterrupted:
      return redrob_private::FollowUpOutcome::kInterrupted;
    case redrob::mojom::FollowUpOutcome::kQueued:
      return redrob_private::FollowUpOutcome::kQueued;
    case redrob::mojom::FollowUpOutcome::kRejected:
      return redrob_private::FollowUpOutcome::kRejected;
  }
  // An outcome this build does not know is reported as rejected rather than as
  // success: the page must not tell the user a message was delivered when the
  // browser cannot say that it was.
  return redrob_private::FollowUpOutcome::kRejected;
}

redrob::mojom::FollowUpMode FromPrivateFollowUpMode(
    redrob_private::FollowUpMode mode) {
  switch (mode) {
    case redrob_private::FollowUpMode::kInterrupt:
      return redrob::mojom::FollowUpMode::kInterrupt;
    case redrob_private::FollowUpMode::kQueue:
      return redrob::mojom::FollowUpMode::kQueue;
    case redrob_private::FollowUpMode::kAuto:
    case redrob_private::FollowUpMode::kNone:
      // `auto` is the ordinary case and the safe default: the browser decides
      // between interrupting and queueing.
      return redrob::mojom::FollowUpMode::kAuto;
  }
  return redrob::mojom::FollowUpMode::kAuto;
}

redrob_private::ModelOption ToPrivateModel(
    const redrob::mojom::ModelOption& option) {
  redrob_private::ModelOption out;
  out.id = option.id;
  out.provider_id = option.provider_id;
  out.name = option.name;
  out.capabilities = option.capabilities;
  out.price_band = option.price_band;
  return out;
}
}  // namespace

// Shared with the task event router, which turns the same struct into the
// onTaskChanged event. Defined once, outside the anonymous namespace, so the
// function surface and the event surface cannot drift into two conversions.
redrob_private::Task ToPrivateTask(const redrob::mojom::Task& task) {
  redrob_private::Task out;
  out.id = task.id;
  out.prompt = task.prompt;
  out.state = ToPrivateState(task.state);
  out.narration = task.narration;
  out.started_at_ms = static_cast<double>(task.started_at_ms);
  out.error = task.error;
  out.mode = ToPrivateMode(task.mode);
  out.working_folder = task.working_folder;
  out.effort = ToPrivateEffort(task.effort);
  out.model = task.model;
  out.queued = task.queued;
  out.awaiting_confirmation = task.awaiting_confirmation;
  for (const auto& step : task.steps) {
    redrob_private::Step wire;
    wire.kind = ToPrivateStepKind(step->kind);
    wire.step_label = step->label;
    wire.started_at_ms = static_cast<double>(step->started_at_ms);
    wire.preview_data_url = step->preview_data_url;
    for (const auto& detail : step->details) {
      redrob_private::StepDetail wire_detail;
      wire_detail.text = detail->text;
      wire_detail.source = detail->source;
      wire_detail.timing = detail->timing;
      wire.details.push_back(std::move(wire_detail));
    }
    out.steps.push_back(std::move(wire));
  }
  return out;
}

ExtensionFunction::ResponseAction RedrobPrivateRemoveMemoryFunction::Run() {
  auto params = redrob_private::RemoveMemory::Params::Create(args());
  EXTENSION_FUNCTION_VALIDATE(params);
  const bool ok =
      MemoryStoreFactory::GetForProfile(ProfileOf(browser_context()))
          ->Remove(params->id);
  return RespondNow(
      ArgumentList(redrob_private::RemoveMemory::Results::Create(ok)));
}

ExtensionFunction::ResponseAction RedrobPrivateSetMemoryPinnedFunction::Run() {
  auto params = redrob_private::SetMemoryPinned::Params::Create(args());
  EXTENSION_FUNCTION_VALIDATE(params);
  const bool ok =
      MemoryStoreFactory::GetForProfile(ProfileOf(browser_context()))
          ->SetPinned(params->id, params->pinned);
  return RespondNow(
      ArgumentList(redrob_private::SetMemoryPinned::Results::Create(ok)));
}

ExtensionFunction::ResponseAction RedrobPrivateRemoveRoutineFunction::Run() {
  auto params = redrob_private::RemoveRoutine::Params::Create(args());
  EXTENSION_FUNCTION_VALIDATE(params);
  const bool ok =
      RoutineStoreFactory::GetForProfile(ProfileOf(browser_context()))
          ->Remove(params->id);
  return RespondNow(
      ArgumentList(redrob_private::RemoveRoutine::Results::Create(ok)));
}

ExtensionFunction::ResponseAction
RedrobPrivateSetRoutineEnabledFunction::Run() {
  auto params = redrob_private::SetRoutineEnabled::Params::Create(args());
  EXTENSION_FUNCTION_VALIDATE(params);
  const bool ok =
      RoutineStoreFactory::GetForProfile(ProfileOf(browser_context()))
          ->SetEnabled(params->id, params->enabled);
  return RespondNow(
      ArgumentList(redrob_private::SetRoutineEnabled::Results::Create(ok)));
}

ExtensionFunction::ResponseAction RedrobPrivateRemoveProviderFunction::Run() {
  auto params = redrob_private::RemoveProvider::Params::Create(args());
  EXTENSION_FUNCTION_VALIDATE(params);
  const bool ok =
      ModelStoreFactory::GetForProfile(ProfileOf(browser_context()))
          ->Remove(params->id);
  return RespondNow(
      ArgumentList(redrob_private::RemoveProvider::Results::Create(ok)));
}

ExtensionFunction::ResponseAction RedrobPrivateSelectProviderFunction::Run() {
  auto params = redrob_private::SelectProvider::Params::Create(args());
  EXTENSION_FUNCTION_VALIDATE(params);
  const bool ok =
      ModelStoreFactory::GetForProfile(ProfileOf(browser_context()))
          ->Select(params->id);
  return RespondNow(
      ArgumentList(redrob_private::SelectProvider::Results::Create(ok)));
}

ExtensionFunction::ResponseAction RedrobPrivateGetSettingsFunction::Run() {
  Profile* profile = Profile::FromBrowserContext(browser_context());
  PrefService* prefs = profile->GetPrefs();
  redrob_private::AgentSettings out;

  const base::FilePath folder = prefs->GetFilePath(redrob::prefs::kWorkingFolder);
  out.working_folder =
      folder.empty() ? std::string() : folder.BaseName().AsUTF8Unsafe();

  // Memory.
  MemoryStore* memory = MemoryStoreFactory::GetForProfile(profile);
  out.memory.enabled = memory->enabled();
  out.memory.retention_days = memory->retention_days();
  for (const MemoryStore::Entry& e : memory->List()) {
    redrob_private::MemoryEntry wire;
    wire.id = e.id;
    wire.text = e.text;
    wire.source = e.source;
    wire.created_ms = static_cast<double>(e.created_at_ms);
    wire.pinned = e.pinned;
    out.memory.entries.push_back(std::move(wire));
  }

  // Model providers + engine state.
  ModelStore* model = ModelStoreFactory::GetForProfile(profile);
  out.model.selected_id = model->selected_id();
  out.model.encryption_ready = model->encryption_ready();
  // PA-3. What first run recorded, read back from the pref it is now actually
  // registered under. Reporting it is what makes the write mean something: before
  // this, nothing in the product could see the choice, so a surface could not even
  // show the user what they had picked.
  //
  // It stays SEPARATE from selected_id rather than being folded into it. This is a
  // subscription family ("redrob", "chatgpt", "claude"); selected_id is a configured
  // provider entry. Collapsing them would require guessing which provider answers for
  // a family, and guessing wrong routes a task somewhere the user never chose.
  out.model.onboarding_choice =
      profile->GetPrefs()->GetString(redrob::prefs::kOnboardingModelChoice);
  TaskStore* tasks = TaskStoreFactory::GetForProfile(profile);
  out.model.engine.default_model = TaskStore::DefaultModel();
  out.model.engine.model_count =
      tasks ? static_cast<int>(tasks->ModelOptionCount()) : 0;
  switch (tasks ? tasks->EngineStatus() : SidecarClient::Status::kUnavailable) {
    case SidecarClient::Status::kUnavailable:
      out.model.engine.state = redrob_private::EngineState::kNotInstalled;
      break;
    case SidecarClient::Status::kStarting:
      out.model.engine.state = redrob_private::EngineState::kStarting;
      break;
    case SidecarClient::Status::kReady:
      out.model.engine.state = redrob_private::EngineState::kReady;
      break;
    case SidecarClient::Status::kFailed:
      out.model.engine.state = redrob_private::EngineState::kFailed;
      break;
  }
  for (const ModelStore::Provider& p : model->List()) {
    redrob_private::Provider wire;
    wire.id = p.id;
    wire.provider_label = p.label;
    wire.model = p.model;
    wire.endpoint = p.endpoint;
    wire.has_secret = p.has_secret;
    wire.is_oauth = p.is_oauth;
    out.model.providers.push_back(std::move(wire));
  }

  // Passwords.
  out.passwords.offer_to_save =
      prefs->GetBoolean(password_manager::prefs::kCredentialsEnableService);
  out.passwords.auto_signin =
      prefs->GetBoolean(password_manager::prefs::kCredentialsEnableAutosignin);
  out.passwords.choice = prefs->GetString(redrob::prefs::kPasswordManagerChoice);

  // Routines.
  for (const RoutineStore::Routine& r :
       RoutineStoreFactory::GetForProfile(profile)->List()) {
    redrob_private::Routine wire;
    wire.id = r.id;
    wire.title = r.title;
    wire.prompt = r.prompt;
    wire.kind = r.kind == RoutineStore::Kind::kHeartbeat
                    ? redrob_private::RoutineKind::kHeartbeat
                    : redrob_private::RoutineKind::kCron;
    wire.every_minutes = r.every_minutes;
    wire.mode = ToPrivateMode(r.mode);
    wire.effort = ToPrivateEffort(r.effort);
    wire.enabled = r.enabled;
    wire.task_id = r.task_id;
    wire.last_run_ms = static_cast<double>(r.last_run_ms);
    wire.next_run_ms = static_cast<double>(r.next_run_ms);
    wire.last_error = r.last_error;
    out.routines.push_back(std::move(wire));
  }

  // Recent chats a heartbeat routine could point at.
  for (const auto& task : TaskStoreFactory::GetForProfile(profile)->ListTasks()) {
    redrob_private::ChatSummary chat;
    chat.id = task->id;
    chat.prompt = task->prompt;
    out.chats.push_back(std::move(chat));
  }

  // Loopback RPC endpoint.
  RpcServer* rpc = RpcServerFactory::GetForProfile(profile);
  out.rpc.enabled = rpc->running();
  out.rpc.endpoint = rpc->endpoint();
  out.rpc.handle_file_name = "redrob-cli.json";

  return RespondNow(
      ArgumentList(redrob_private::GetSettings::Results::Create(out)));
}

ExtensionFunction::ResponseAction RedrobPrivateAddProviderFunction::Run() {
  auto params = redrob_private::AddProvider::Params::Create(args());
  EXTENSION_FUNCTION_VALIDATE(params);
  // The secret travels one way: into the store. getSettings never reads it back.
  const std::string id =
      ModelStoreFactory::GetForProfile(
          Profile::FromBrowserContext(browser_context()))
          ->Add(params->provider_label, params->model, params->endpoint,
                params->secret);
  // Built by hand rather than through Results::Create, which takes a plain
  // string: an empty list calls the callback with nothing, which is what "not
  // stored" means. An empty string would say "stored, with an empty id".
  base::ListValue result;
  if (!id.empty()) {
    result.Append(id);
  }
  return RespondNow(ArgumentList(std::move(result)));
}

ExtensionFunction::ResponseAction
RedrobPrivateSetOfferToSavePasswordsFunction::Run() {
  auto params = redrob_private::SetOfferToSavePasswords::Params::Create(args());
  EXTENSION_FUNCTION_VALIDATE(params);
  Profile::FromBrowserContext(browser_context())
      ->GetPrefs()
      ->SetBoolean(password_manager::prefs::kCredentialsEnableService,
                   params->enabled);
  return RespondNow(NoArguments());
}

ExtensionFunction::ResponseAction
RedrobPrivateSetPasswordAutoSigninFunction::Run() {
  auto params = redrob_private::SetPasswordAutoSignin::Params::Create(args());
  EXTENSION_FUNCTION_VALIDATE(params);
  Profile::FromBrowserContext(browser_context())
      ->GetPrefs()
      ->SetBoolean(password_manager::prefs::kCredentialsEnableAutosignin,
                   params->enabled);
  return RespondNow(NoArguments());
}

ExtensionFunction::ResponseAction
RedrobPrivateSetPasswordManagerChoiceFunction::Run() {
  auto params =
      redrob_private::SetPasswordManagerChoice::Params::Create(args());
  EXTENSION_FUNCTION_VALIDATE(params);
  // Three known values and nothing else: this arrives from a renderer and ends
  // up rendered back.
  const std::string& choice = params->choice;
  if (choice != "redrob" && choice != "external" && choice != "skip") {
    return RespondNow(NoArguments());
  }
  PrefService* prefs =
      Profile::FromBrowserContext(browser_context())->GetPrefs();
  prefs->SetString(redrob::prefs::kPasswordManagerChoice, choice);
  // "I use another manager" means stop offering to save. It does NOT mean
  // Chromium forgets the credentials it already has, and the page says so
  // rather than implying a migration happened.
  if (choice == "external") {
    prefs->SetBoolean(password_manager::prefs::kCredentialsEnableService,
                      false);
  }
  return RespondNow(NoArguments());
}

// --- Window and tab preferences ---------------------------------------------
//
// One registered pref in, one registered pref out, and no side effect beyond
// the pref service. Nothing native reads these yet; see the block comment on
// the same functions in redrob_private.idl for why that is the finished state
// of this change rather than a missing half of it.

ExtensionFunction::ResponseAction
RedrobPrivateGetVerticalTabInsertionPositionFunction::Run() {
  return RespondNow(ArgumentList(
      redrob_private::GetVerticalTabInsertionPosition::Results::Create(
          Profile::FromBrowserContext(browser_context())
              ->GetPrefs()
              ->GetString(redrob::prefs::kVerticalTabInsertionPosition))));
}

ExtensionFunction::ResponseAction
RedrobPrivateSetVerticalTabInsertionPositionFunction::Run() {
  auto params =
      redrob_private::SetVerticalTabInsertionPosition::Params::Create(args());
  EXTENSION_FUNCTION_VALIDATE(params);
  // Two known values and nothing else, for the same reason as the password
  // choice above: this arrives from a renderer and is read back out.
  const std::string& position = params->position;
  if (position != "after_current" && position != "end") {
    return RespondNow(NoArguments());
  }
  Profile::FromBrowserContext(browser_context())
      ->GetPrefs()
      ->SetString(redrob::prefs::kVerticalTabInsertionPosition, position);
  return RespondNow(NoArguments());
}

ExtensionFunction::ResponseAction
RedrobPrivateGetHorizontalTabShrinkEnabledFunction::Run() {
  return RespondNow(ArgumentList(
      redrob_private::GetHorizontalTabShrinkEnabled::Results::Create(
          Profile::FromBrowserContext(browser_context())
              ->GetPrefs()
              ->GetBoolean(redrob::prefs::kHorizontalTabShrinkEnabled))));
}

ExtensionFunction::ResponseAction
RedrobPrivateSetHorizontalTabShrinkEnabledFunction::Run() {
  auto params =
      redrob_private::SetHorizontalTabShrinkEnabled::Params::Create(args());
  EXTENSION_FUNCTION_VALIDATE(params);
  Profile::FromBrowserContext(browser_context())
      ->GetPrefs()
      ->SetBoolean(redrob::prefs::kHorizontalTabShrinkEnabled,
                   params->enabled);
  return RespondNow(NoArguments());
}

ExtensionFunction::ResponseAction
RedrobPrivateGetWindowTranslucencyEnabledFunction::Run() {
  return RespondNow(
      ArgumentList(redrob_private::GetWindowTranslucencyEnabled::Results::Create(
          Profile::FromBrowserContext(browser_context())
              ->GetPrefs()
              ->GetBoolean(redrob::prefs::kWindowTranslucencyEnabled))));
}

ExtensionFunction::ResponseAction
RedrobPrivateSetWindowTranslucencyEnabledFunction::Run() {
  auto params =
      redrob_private::SetWindowTranslucencyEnabled::Params::Create(args());
  EXTENSION_FUNCTION_VALIDATE(params);
  Profile::FromBrowserContext(browser_context())
      ->GetPrefs()
      ->SetBoolean(redrob::prefs::kWindowTranslucencyEnabled, params->enabled);
  return RespondNow(NoArguments());
}

namespace {

// The renderer-facing names for ThemeService::BrowserColorScheme. Strings rather than the stored integers,
// because the integers are a pref encoding the page has no business depending on.
constexpr char kColorSchemeSystem[] = "system";
constexpr char kColorSchemeLight[] = "light";
constexpr char kColorSchemeDark[] = "dark";

}  // namespace

ExtensionFunction::ResponseAction RedrobPrivateGetColorSchemeFunction::Run() {
  ThemeService* theme = ThemeServiceFactory::GetForProfile(
      Profile::FromBrowserContext(browser_context()));
  const char* name = kColorSchemeSystem;
  switch (theme->GetBrowserColorScheme()) {
    case ThemeService::BrowserColorScheme::kLight:
      name = kColorSchemeLight;
      break;
    case ThemeService::BrowserColorScheme::kDark:
      name = kColorSchemeDark;
      break;
    case ThemeService::BrowserColorScheme::kSystem:
      break;
  }
  return RespondNow(
      ArgumentList(redrob_private::GetColorScheme::Results::Create(name)));
}

ExtensionFunction::ResponseAction RedrobPrivateSetColorSchemeFunction::Run() {
  auto params = redrob_private::SetColorScheme::Params::Create(args());
  EXTENSION_FUNCTION_VALIDATE(params);
  ThemeService::BrowserColorScheme scheme;
  if (params->scheme == kColorSchemeSystem) {
    scheme = ThemeService::BrowserColorScheme::kSystem;
  } else if (params->scheme == kColorSchemeLight) {
    scheme = ThemeService::BrowserColorScheme::kLight;
  } else if (params->scheme == kColorSchemeDark) {
    scheme = ThemeService::BrowserColorScheme::kDark;
  } else {
    // Ignored rather than stored: this arrives from a renderer.
    return RespondNow(NoArguments());
  }
  // Through ThemeService, not prefs->SetInteger: its setter is what notifies the frame and the colour
  // pipeline, so the window re-themes exactly as it does from chrome://settings/appearance.
  ThemeServiceFactory::GetForProfile(
      Profile::FromBrowserContext(browser_context()))
      ->SetBrowserColorScheme(scheme);
  return RespondNow(NoArguments());
}

ExtensionFunction::ResponseAction
RedrobPrivateGetAutomaticPictureInPictureEnabledFunction::Run() {
  return RespondNow(ArgumentList(
      redrob_private::GetAutomaticPictureInPictureEnabled::Results::Create(
          Profile::FromBrowserContext(browser_context())
              ->GetPrefs()
              ->GetBoolean(
                  redrob::prefs::kAutomaticPictureInPictureEnabled))));
}

ExtensionFunction::ResponseAction
RedrobPrivateSetAutomaticPictureInPictureEnabledFunction::Run() {
  auto params =
      redrob_private::SetAutomaticPictureInPictureEnabled::Params::Create(
          args());
  EXTENSION_FUNCTION_VALIDATE(params);
  Profile::FromBrowserContext(browser_context())
      ->GetPrefs()
      ->SetBoolean(redrob::prefs::kAutomaticPictureInPictureEnabled,
                   params->enabled);
  return RespondNow(NoArguments());
}

ExtensionFunction::ResponseAction RedrobPrivateSetRpcEnabledFunction::Run() {
  auto params = redrob_private::SetRpcEnabled::Params::Create(args());
  EXTENSION_FUNCTION_VALIDATE(params);
  Profile* profile = Profile::FromBrowserContext(browser_context());
  profile->GetPrefs()->SetBoolean(redrob::prefs::kRpcEnabled, params->enabled);
  RpcServer* rpc = RpcServerFactory::GetForProfile(profile);
  // Applied now rather than at the next launch. A setting whose effect you have
  // to restart to see is a setting people toggle twice and then distrust.
  base::ListValue result;
  if (params->enabled && rpc->Start()) {
    // Only an endpoint that is actually listening is reported. Off, or failed
    // to start, sends nothing at all rather than an empty address.
    result.Append(rpc->endpoint());
  } else if (!params->enabled) {
    rpc->Stop();
  }
  return RespondNow(ArgumentList(std::move(result)));
}

ExtensionFunction::ResponseAction
RedrobPrivateClearWorkingFolderFunction::Run() {
  Profile::FromBrowserContext(browser_context())
      ->GetPrefs()
      ->SetFilePath(redrob::prefs::kWorkingFolder, base::FilePath());
  return RespondNow(NoArguments());
}

ExtensionFunction::ResponseAction RedrobPrivateAddRoutineFunction::Run() {
  auto params = redrob_private::AddRoutine::Params::Create(args());
  EXTENSION_FUNCTION_VALIDATE(params);
  const std::string id =
      RoutineStoreFactory::GetForProfile(
          Profile::FromBrowserContext(browser_context()))
          ->Add(FromPrivateRoutine(params->routine));
  base::ListValue result;
  if (!id.empty()) {
    result.Append(id);
  }
  return RespondNow(ArgumentList(std::move(result)));
}

ExtensionFunction::ResponseAction RedrobPrivateUpdateRoutineFunction::Run() {
  auto params = redrob_private::UpdateRoutine::Params::Create(args());
  EXTENSION_FUNCTION_VALIDATE(params);
  const bool existed =
      RoutineStoreFactory::GetForProfile(
          Profile::FromBrowserContext(browser_context()))
          ->Update(FromPrivateRoutine(params->routine));
  return RespondNow(ArgumentList(
      redrob_private::UpdateRoutine::Results::Create(existed)));
}

ExtensionFunction::ResponseAction RedrobPrivateRunRoutineNowFunction::Run() {
  auto params = redrob_private::RunRoutineNow::Params::Create(args());
  EXTENSION_FUNCTION_VALIDATE(params);
  const std::string task_id =
      RoutineStoreFactory::GetForProfile(
          Profile::FromBrowserContext(browser_context()))
          ->RunNow(params->id);
  // Nothing rather than an empty id when it did not start: the caller has to be
  // able to tell "started, here is the task" from "did not start".
  base::ListValue result;
  if (!task_id.empty()) {
    result.Append(task_id);
  }
  return RespondNow(ArgumentList(std::move(result)));
}

ExtensionFunction::ResponseAction
RedrobPrivateChooseWorkingFolderFunction::Run() {
  content::WebContents* web_contents = GetSenderWebContents();
  if (!web_contents) {
    return RespondNow(ArgumentList(base::ListValue()));
  }
  // The picker outlives this call and answers once. Binding `this` keeps the
  // function alive until it does, because an ExtensionFunction is ref-counted.
  RedrobPrivateFolderPicker::Show(
      web_contents, u"Choose the folder agent tasks may write into",
      base::BindOnce(
          &RedrobPrivateChooseWorkingFolderFunction::OnFolderChosen, this));
  return RespondLater();
}

void RedrobPrivateChooseWorkingFolderFunction::OnFolderChosen(
    const base::FilePath& path) {
  base::ListValue result;
  // A relative path would be recorded and then resolved against whatever the
  // browser's working directory happens to be, so it is refused rather than
  // stored.
  if (!path.empty() && path.IsAbsolute()) {
    Profile::FromBrowserContext(browser_context())
        ->GetPrefs()
        ->SetFilePath(redrob::prefs::kWorkingFolder, path);
    // The page is told the display name; the full path stays in the pref.
    result.Append(path.BaseName().AsUTF8Unsafe());
  }
  Respond(ArgumentList(std::move(result)));
}

ExtensionFunction::ResponseAction
RedrobPrivateBeginProviderSignInFunction::Run() {
  auto params = redrob_private::BeginProviderSignIn::Params::Create(args());
  EXTENSION_FUNCTION_VALIDATE(params);
  redrob::OAuthFlow::Config config;
  config.authorize_url = GURL(params->authorize_url);
  config.token_url = GURL(params->token_url);
  config.client_id = params->client_id;
  config.scopes = params->scopes;
  ModelStoreFactory::GetForProfile(
      Profile::FromBrowserContext(browser_context()))
      ->BeginOAuth(
          params->provider_label, params->model, params->endpoint, config,
          base::BindOnce(
              &RedrobPrivateBeginProviderSignInFunction::OnAuthorizeUrl, this));
  return RespondLater();
}

void RedrobPrivateBeginProviderSignInFunction::OnAuthorizeUrl(
    const GURL& authorize,
    const std::string& error) {
  base::ListValue result;
  if (!authorize.is_valid() || !error.empty()) {
    result.Append(error.empty() ? "The sign-in could not be started." : error);
    Respond(ArgumentList(std::move(result)));
    return;
  }
  // Opened by the browser, in a tab, because that is what this product is. A
  // page cannot be trusted to have navigated somewhere the user can see.
  NavigateParams params(Profile::FromBrowserContext(browser_context()),
                        authorize, ui::PAGE_TRANSITION_AUTO_BOOKMARK);
  params.disposition = WindowOpenDisposition::NEW_FOREGROUND_TAB;
  Navigate(&params);
  // Nothing appended: no error.
  Respond(ArgumentList(std::move(result)));
}

ExtensionFunction::ResponseAction
RedrobPrivateOpenPasswordManagerFunction::Run() {
  NavigateParams params(Profile::FromBrowserContext(browser_context()),
                        GURL(chrome::kChromeUIPasswordManagerURL),
                        ui::PAGE_TRANSITION_AUTO_BOOKMARK);
  params.disposition = WindowOpenDisposition::SINGLETON_TAB;
  Navigate(&params);
  return RespondNow(NoArguments());
}

ExtensionFunction::ResponseAction RedrobPrivateListModelsFunction::Run() {
  std::vector<redrob_private::ModelOption> out;
  for (const auto& option :
       TaskStoreFactory::GetForProfile(
           Profile::FromBrowserContext(browser_context()))
           ->ListModels()) {
    out.push_back(ToPrivateModel(*option));
  }
  // An empty list is a real answer: the engine may not be serving.
  return RespondNow(
      ArgumentList(redrob_private::ListModels::Results::Create(out)));
}

ExtensionFunction::ResponseAction RedrobPrivateListTasksFunction::Run() {
  std::vector<redrob_private::Task> out;
  for (const auto& task :
       TaskStoreFactory::GetForProfile(
           Profile::FromBrowserContext(browser_context()))
           ->ListTasks()) {
    out.push_back(ToPrivateTask(*task));
  }
  return RespondNow(
      ArgumentList(redrob_private::ListTasks::Results::Create(out)));
}

ExtensionFunction::ResponseAction RedrobPrivateGetTaskFunction::Run() {
  auto params = redrob_private::GetTask::Params::Create(args());
  EXTENSION_FUNCTION_VALIDATE(params);
  const redrob::mojom::TaskPtr task =
      TaskStoreFactory::GetForProfile(
          Profile::FromBrowserContext(browser_context()))
          ->GetTask(params->task_id);
  // Nothing rather than an error, and nothing rather than an empty task: a tab's
  // URL is a string a renderer can put anything in, including the id of a task
  // from a previous browser session.
  base::ListValue result;
  if (task) {
    result.Append(ToPrivateTask(*task).ToValue());
  }
  return RespondNow(ArgumentList(std::move(result)));
}

ExtensionFunction::ResponseAction RedrobPrivateCancelTaskFunction::Run() {
  auto params = redrob_private::CancelTask::Params::Create(args());
  EXTENSION_FUNCTION_VALIDATE(params);
  // Nothing to report: a task that was already finished, or never existed, is
  // not running now either, which is what the caller wanted.
  TaskStoreFactory::GetForProfile(
      Profile::FromBrowserContext(browser_context()))
      ->CancelTask(params->task_id);
  return RespondNow(NoArguments());
}

ExtensionFunction::ResponseAction
RedrobPrivateSetPermissionModeFunction::Run() {
  auto params = redrob_private::SetPermissionMode::Params::Create(args());
  EXTENSION_FUNCTION_VALIDATE(params);
  const bool accepted =
      TaskStoreFactory::GetForProfile(
          Profile::FromBrowserContext(browser_context()))
          ->SetPermissionMode(params->task_id, FromPrivateMode(params->mode));
  return RespondNow(ArgumentList(
      redrob_private::SetPermissionMode::Results::Create(accepted)));
}

ExtensionFunction::ResponseAction
RedrobPrivateWithdrawQueuedFollowUpFunction::Run() {
  auto params = redrob_private::WithdrawQueuedFollowUp::Params::Create(args());
  EXTENSION_FUNCTION_VALIDATE(params);
  // A negative index cannot address a queue entry, and the store takes an
  // unsigned one, so it is refused here rather than wrapping around to an
  // enormous index.
  if (params->index < 0) {
    return RespondNow(ArgumentList(
        redrob_private::WithdrawQueuedFollowUp::Results::Create(false)));
  }
  const bool withdrawn =
      TaskStoreFactory::GetForProfile(
          Profile::FromBrowserContext(browser_context()))
          ->WithdrawQueuedFollowUp(params->task_id,
                                   static_cast<uint32_t>(params->index),
                                   params->expected_prompt);
  return RespondNow(ArgumentList(
      redrob_private::WithdrawQueuedFollowUp::Results::Create(withdrawn)));
}

ExtensionFunction::ResponseAction
RedrobPrivateSearchWithDefaultProviderFunction::Run() {
  auto params = redrob_private::SearchWithDefaultProvider::Params::Create(args());
  EXTENSION_FUNCTION_VALIDATE(params);
  content::WebContents* web_contents = GetSenderWebContents();
  if (!web_contents || params->query.empty()) {
    return RespondNow(NoArguments());
  }
  Profile* profile = Profile::FromBrowserContext(browser_context());
  TemplateURLService* service =
      profile ? TemplateURLServiceFactory::GetForProfile(profile) : nullptr;
  const TemplateURL* provider =
      service ? service->GetDefaultSearchProvider() : nullptr;
  // No default provider is a real state -- enterprise policy can remove it, and
  // the search-engine choice screen leaves it unset until the user picks. Doing
  // nothing is right: there is no engine to ask, and substituting one would
  // override exactly the choice this call exists to respect.
  if (!provider) {
    return RespondNow(NoArguments());
  }
  const GURL url(provider->url_ref().ReplaceSearchTerms(
      TemplateURLRef::SearchTermsArgs(base::UTF8ToUTF16(params->query)),
      service->search_terms_data()));
  if (!url.is_valid()) {
    return RespondNow(NoArguments());
  }
  // Replaces this page rather than opening a tab: the user typed into this
  // surface and expects results where they were.
  content::OpenURLParams open_params(url, content::Referrer(),
                                     WindowOpenDisposition::CURRENT_TAB,
                                     ui::PAGE_TRANSITION_GENERATED,
                                     /*is_renderer_initiated=*/false);
  web_contents->OpenURL(open_params, /*navigation_handle_callback=*/{});
  return RespondNow(NoArguments());
}

ExtensionFunction::ResponseAction RedrobPrivateStartTaskFunction::Run() {
  auto params = redrob_private::StartTask::Params::Create(args());
  EXTENSION_FUNCTION_VALIDATE(params);
  auto [task_id, error] =
      TaskStoreFactory::GetForProfile(
          Profile::FromBrowserContext(browser_context()))
          ->StartTask(params->prompt, params->context_refs,
                      FromPrivateMode(params->mode),
                      FromPrivateEffort(params->effort), params->model);
  redrob_private::StartTaskResult result;
  if (task_id) {
    result.task_id = *task_id;
  }
  if (error) {
    result.error = ToPrivateStartError(*error);
  }
  return RespondNow(
      ArgumentList(redrob_private::StartTask::Results::Create(result)));
}

ExtensionFunction::ResponseAction RedrobPrivateSendFollowUpFunction::Run() {
  auto params = redrob_private::SendFollowUp::Params::Create(args());
  EXTENSION_FUNCTION_VALIDATE(params);
  const redrob::mojom::FollowUpOutcome outcome =
      TaskStoreFactory::GetForProfile(
          Profile::FromBrowserContext(browser_context()))
          ->SendFollowUp(params->task_id, params->prompt,
                         FromPrivateFollowUpMode(params->mode));
  return RespondNow(ArgumentList(
      redrob_private::SendFollowUp::Results::Create(ToPrivateOutcome(outcome))));
}

ExtensionFunction::ResponseAction
RedrobPrivateChooseTaskWorkingFolderFunction::Run() {
  auto params = redrob_private::ChooseTaskWorkingFolder::Params::Create(args());
  EXTENSION_FUNCTION_VALIDATE(params);
  content::WebContents* web_contents = GetSenderWebContents();
  if (!web_contents) {
    return RespondNow(ArgumentList(base::ListValue()));
  }
  // The task's folder, not the profile's default: this never touches the
  // kWorkingFolder pref that the settings page's chooseWorkingFolder writes.
  RedrobPrivateFolderPicker::Show(
      web_contents, u"Choose the folder this task may write into",
      base::BindOnce(
          &RedrobPrivateChooseTaskWorkingFolderFunction::OnFolderChosen, this,
          params->task_id));
  return RespondLater();
}

void RedrobPrivateChooseTaskWorkingFolderFunction::OnFolderChosen(
    const std::string& task_id,
    const base::FilePath& path) {
  base::ListValue result;
  if (!path.empty() && path.IsAbsolute()) {
    // The store answers with the display name the page may show, or nothing when
    // the task is unknown — which it can be by the time a dialog closes.
    const std::optional<std::string> display =
        TaskStoreFactory::GetForProfile(
            Profile::FromBrowserContext(browser_context()))
            ->SetWorkingFolder(task_id, path);
    if (display) {
      result.Append(*display);
    }
  }
  Respond(ArgumentList(std::move(result)));
}

ExtensionFunction::ResponseAction
RedrobPrivateGetEngineCredentialFunction::Run() {
  // Synchronous: both values are already in memory on the client this profile owns.
  api::redrob_private::EngineCredential out;
  TaskStore* tasks = TaskStoreFactory::GetForProfile(
      Profile::FromBrowserContext(browser_context()));
  if (tasks) {
    std::string credential = tasks->EngineCredential();
    std::string base_url = tasks->EngineBaseUrl();
    // Each field is set only when it is real. Leaving them absent rather than
    // sending empty strings is what lets the extension tell "no engine" from "an
    // engine with a blank credential" -- and only the second of those would ever
    // be a reason to send a request, which is to say never (F-5).
    if (!credential.empty()) {
      out.credential = std::move(credential);
    }
    if (!base_url.empty()) {
      out.base_url = std::move(base_url);
    }
  }
  return RespondNow(WithArguments(out.ToValue()));
}

ExtensionFunction::ResponseAction
RedrobPrivateGetEngineInstallStateFunction::Run() {
  // Asynchronous because answering means touching the filesystem when no
  // install is in flight, and the UI thread is not where that belongs.
  RedrobPrivateEngineInstallerFactory::GetForBrowserContext(browser_context())
      ->GetState(base::BindOnce(
          &RedrobPrivateGetEngineInstallStateFunction::OnState, this));
  return RespondLater();
}

void RedrobPrivateGetEngineInstallStateFunction::OnState(
    api::redrob_private::EngineInstallInfo info) {
  Respond(WithArguments(info.ToValue()));
}

ExtensionFunction::ResponseAction RedrobPrivateInstallEngineFunction::Run() {
  // The installer owns the run and broadcasts onEngineInstallStateChanged; this
  // returns immediately because the install outlives the call, exactly as
  // startImport does.
  RedrobPrivateEngineInstallerFactory::GetForBrowserContext(browser_context())
      ->Install();
  return RespondNow(NoArguments());
}

}  // namespace extensions
