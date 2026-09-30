// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/extensions/api/redrob_private/redrob_private_api.h"

#include <string>

#include "base/files/file_path.h"
#include "base/functional/bind.h"
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
#include "chrome/browser/ui/navigator/browser_navigator.h"
#include "chrome/browser/ui/navigator/browser_navigator_params.h"
#include "chrome/browser/ui/webui/redrob/redrob.mojom.h"
#include "chrome/common/webui_url_constants.h"
#include "components/password_manager/core/common/password_manager_pref_names.h"
#include "components/prefs/pref_service.h"
#include "content/public/browser/web_contents.h"
#include "url/gurl.h"
#include "chrome/common/extensions/api/redrob_private.h"
#include "components/version_info/version_info.h"

namespace extensions {

namespace redrob_private = api::redrob_private;

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
RedrobPrivateSetMemoryEnabledFunction::Run() {
  auto params = redrob_private::SetMemoryEnabled::Params::Create(args());
  EXTENSION_FUNCTION_VALIDATE(params);
  MemoryStoreFactory::GetForProfile(
      Profile::FromBrowserContext(browser_context()))
      ->SetEnabled(params->enabled);
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
}  // namespace

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

}  // namespace extensions
