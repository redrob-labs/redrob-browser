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
#include "chrome/browser/extensions/api/redrob_private/redrob_private_import_manager.h"
#include "chrome/browser/extensions/api/redrob_private/redrob_private_import_manager_factory.h"
#include "chrome/browser/extensions/api/redrob_private/redrob_private_onboarding_service.h"
#include "chrome/browser/extensions/api/redrob_private/redrob_private_onboarding_service_factory.h"
#include "chrome/browser/importer/importer_list.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/redrob/redrob_prefs.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/redrob/agent_service_factories.h"
#include "chrome/browser/redrob/memory_store.h"
#include "chrome/browser/redrob/model_store.h"
#include "chrome/browser/redrob/routine_store.h"
#include "chrome/common/extensions/api/redrob_private.h"
#include "components/prefs/pref_service.h"
#include "components/user_data_importer/common/importer_data_types.h"
#include "components/version_info/version_info.h"

namespace extensions {

namespace redrob_private = api::redrob_private;

namespace {

// The model choice is recorded, but nothing in the product reads it yet, so it
// has no registered pref. Kept here, next to the write, so the reason travels
// with the code rather than living only in the onboarding host it moved from.
constexpr char kModelChoicePref[] = "redrob.onboarding.model_choice";

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
using redrob::MemoryStoreFactory;
using redrob::ModelStoreFactory;
using redrob::RoutineStoreFactory;

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
        ->SetString(kModelChoicePref, params->choice);
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

}  // namespace extensions
