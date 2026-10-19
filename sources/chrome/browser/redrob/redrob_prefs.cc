// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/redrob/redrob_prefs.h"

#include "base/files/file_path.h"
#include "components/pref_registry/pref_registry_syncable.h"

namespace redrob::prefs {

void RegisterProfilePrefs(user_prefs::PrefRegistrySyncable* registry) {
  registry->RegisterFilePathPref(kWorkingFolder, base::FilePath());

  registry->RegisterListPref(kRoutines);

  // On by default: memory is what makes a second task cheaper than the first, and a browser that
  // silently remembers nothing until you find a switch is not the product. Reviewable and deletable
  // from Settings is what makes that defensible, not defaulting it off.
  registry->RegisterBooleanPref(kMemoryEnabled, true);
  registry->RegisterListPref(kMemoryEntries);
  // 90 days rather than forever. A default that keeps everything for the life of the profile is a
  // decision made on the user's behalf that they never see the consequences of until they look.
  registry->RegisterIntegerPref(kMemoryRetentionDays, 90);
  registry->RegisterBooleanPref(kMemoryMigrated, false);
  registry->RegisterListPref(kMemoryRuns);
  registry->RegisterDoublePref(kMemoryLastConsolidationMs, 0);
  // Off: the agent's own tab history is still browsing history, and handing it to a model is the
  // user's call to make, not a default.
  registry->RegisterBooleanPref(kMemoryHistoryInput, false);

  registry->RegisterListPref(kModelProviders);
  registry->RegisterStringPref(kSelectedProviderId, std::string());
  // Empty until first run asks. Unregistered before this, which meant every write was silently
  // dropped and the user's onboarding choice never existed.
  registry->RegisterStringPref(kOnboardingModelChoice, std::string());

  registry->RegisterBooleanPref(kRpcEnabled, false);
  registry->RegisterStringPref(kPasswordManagerChoice, std::string());
  registry->RegisterBooleanPref(kImportCompleted, false);

  // Window and tab behaviour. Every default here is what the browser does today, so registering
  // them changes nothing observable -- see the note in the header for why that is the requirement
  // and not merely a convenience.
  registry->RegisterStringPref(kVerticalTabInsertionPosition, "after_current");
  registry->RegisterBooleanPref(kHorizontalTabShrinkEnabled, true);
  registry->RegisterBooleanPref(kWindowTranslucencyEnabled, false);
  registry->RegisterBooleanPref(kAutomaticPictureInPictureEnabled, false);

  // CAP-4: tasks outlive the window by default. See the header.
  registry->RegisterBooleanPref(kKeepTasksRunning, true);
  // Agent sign-in. While-unlocked by default: an agent that can sign in to anything the user ever saved,
  // with nobody present, is a decision the user should make by name rather than inherit.
  registry->RegisterIntegerPref(kAgentCredentialsPolicy, 1);
  registry->RegisterIntegerPref(kAgentCredentialsUnlockMinutes, 15);
  registry->RegisterDictionaryPref(kAgentCredentialsSites);
  registry->RegisterListPref(kAgentCredentialsAudit);
  // CAP-5. On by default: the shortcut is the quick window's only entrance, and a feature reachable
  // only after finding a setting is one nobody finds. Settings can change or turn it off.
  registry->RegisterStringPref(kQuickWindowShortcut, kQuickWindowShortcutPrimaryShiftSpace);
}

}  // namespace redrob::prefs
