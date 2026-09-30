// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/extensions/api/redrob_private/redrob_private_api.h"

#include <string>

#include "base/files/file_path.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/redrob/agent_service_factories.h"
#include "chrome/browser/redrob/memory_store.h"
#include "chrome/browser/redrob/model_store.h"
#include "chrome/browser/redrob/redrob_prefs.h"
#include "chrome/browser/redrob/routine_store.h"
#include "chrome/browser/redrob/rpc_server.h"
#include "chrome/browser/redrob/sidecar_client.h"
#include "chrome/browser/redrob/task_store.h"
#include "chrome/browser/redrob/task_store_factory.h"
#include "chrome/browser/ui/webui/redrob/redrob.mojom.h"
#include "components/password_manager/core/common/password_manager_pref_names.h"
#include "components/prefs/pref_service.h"
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

}  // namespace extensions
