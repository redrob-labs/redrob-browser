// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/extensions/api/redrob_private/redrob_private_api.h"

#include <string>

#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/redrob/memory_store.h"
#include "chrome/browser/redrob/model_store.h"
#include "chrome/browser/redrob/routine_store.h"
#include "chrome/common/extensions/api/redrob_private.h"
#include "components/version_info/version_info.h"

namespace extensions {

namespace redrob_private = api::redrob_private;

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
