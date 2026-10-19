// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_API_H_
#define CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_API_H_

#include <memory>

#include "chrome/browser/importer/importer_list.h"
#include <optional>
#include <string>

#include "chrome/browser/redrob/task_store.h"
#include "chrome/browser/ui/webui/redrob/redrob.mojom.h"
#include "chrome/common/extensions/api/redrob_private.h"
#include "extensions/browser/extension_function.h"

namespace base {
class FilePath;
}  // namespace base

class GURL;

namespace extensions {

// The one conversion from the agent's task struct to the private API's, shared
// by getTask/listTasks and by the onTaskChanged event, so the two surfaces
// cannot drift into two different shapes of the same task.
api::redrob_private::Task ToPrivateTask(const redrob::mojom::Task& task);

class RedrobPrivateGetBrowserVersionFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.getBrowserVersion",
                             REDROBPRIVATE_GETBROWSERVERSION)

 protected:
  ~RedrobPrivateGetBrowserVersionFunction() override = default;

  // ExtensionFunction:
  ResponseAction Run() override;
};

class RedrobPrivateSetPasswordChoiceFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.setPasswordChoice",
                             REDROBPRIVATE_SETPASSWORDCHOICE)

 protected:
  ~RedrobPrivateSetPasswordChoiceFunction() override = default;

  // ExtensionFunction:
  ResponseAction Run() override;
};

class RedrobPrivateSetModelChoiceFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.setModelChoice",
                             REDROBPRIVATE_SETMODELCHOICE)

 protected:
  ~RedrobPrivateSetModelChoiceFunction() override = default;

  // ExtensionFunction:
  ResponseAction Run() override;
};

class RedrobPrivateGetImportSourcesFunction : public ExtensionFunction {
 public:
  RedrobPrivateGetImportSourcesFunction();

  DECLARE_EXTENSION_FUNCTION("redrobPrivate.getImportSources",
                             REDROBPRIVATE_GETIMPORTSOURCES)

 protected:
  ~RedrobPrivateGetImportSourcesFunction() override;

  // ExtensionFunction:
  ResponseAction Run() override;

 private:
  // Detection is asynchronous; the ImporterList must outlive Run().
  void OnSourcesDetected();

  std::unique_ptr<ImporterList> importer_list_;
};

class RedrobPrivateStartImportFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.startImport",
                             REDROBPRIVATE_STARTIMPORT)

 protected:
  ~RedrobPrivateStartImportFunction() override = default;

  // ExtensionFunction:
  ResponseAction Run() override;
};

class RedrobPrivateCompleteOnboardingFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.completeOnboarding",
                             REDROBPRIVATE_COMPLETEONBOARDING)

 protected:
  ~RedrobPrivateCompleteOnboardingFunction() override = default;

  // ExtensionFunction:
  ResponseAction Run() override;
};

class RedrobPrivateGetSettingsFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.getSettings",
                             REDROBPRIVATE_GETSETTINGS)

 protected:
  ~RedrobPrivateGetSettingsFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateSetMemoryEnabledFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.setMemoryEnabled",
                             REDROBPRIVATE_SETMEMORYENABLED)

 protected:
  ~RedrobPrivateSetMemoryEnabledFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateSetMemoryRetentionDaysFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.setMemoryRetentionDays",
                             REDROBPRIVATE_SETMEMORYRETENTIONDAYS)

 protected:
  ~RedrobPrivateSetMemoryRetentionDaysFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateForgetAllMemoryFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.forgetAllMemory",
                             REDROBPRIVATE_FORGETALLMEMORY)

 protected:
  ~RedrobPrivateForgetAllMemoryFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateRemoveMemoryFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.removeMemory",
                             REDROBPRIVATE_REMOVEMEMORY)
 protected:
  ~RedrobPrivateRemoveMemoryFunction() override = default;
  ResponseAction Run() override;

 private:
  void OnDone(std::string run_id, bool ok, const std::string& message);
};

class RedrobPrivateSetMemoryPinnedFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.setMemoryPinned",
                             REDROBPRIVATE_SETMEMORYPINNED)
 protected:
  ~RedrobPrivateSetMemoryPinnedFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateRemoveRoutineFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.removeRoutine",
                             REDROBPRIVATE_REMOVEROUTINE)
 protected:
  ~RedrobPrivateRemoveRoutineFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateSetRoutineEnabledFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.setRoutineEnabled",
                             REDROBPRIVATE_SETROUTINEENABLED)
 protected:
  ~RedrobPrivateSetRoutineEnabledFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateRemoveProviderFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.removeProvider",
                             REDROBPRIVATE_REMOVEPROVIDER)
 protected:
  ~RedrobPrivateRemoveProviderFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateSelectProviderFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.selectProvider",
                             REDROBPRIVATE_SELECTPROVIDER)
 protected:
  ~RedrobPrivateSelectProviderFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateAddProviderFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.addProvider",
                             REDROBPRIVATE_ADDPROVIDER)
 protected:
  ~RedrobPrivateAddProviderFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateSetOfferToSavePasswordsFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.setOfferToSavePasswords",
                             REDROBPRIVATE_SETOFFERTOSAVEPASSWORDS)
 protected:
  ~RedrobPrivateSetOfferToSavePasswordsFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateSetPasswordAutoSigninFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.setPasswordAutoSignin",
                             REDROBPRIVATE_SETPASSWORDAUTOSIGNIN)
 protected:
  ~RedrobPrivateSetPasswordAutoSigninFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateSetPasswordManagerChoiceFunction
    : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.setPasswordManagerChoice",
                             REDROBPRIVATE_SETPASSWORDMANAGERCHOICE)
 protected:
  ~RedrobPrivateSetPasswordManagerChoiceFunction() override = default;
  ResponseAction Run() override;
};

// Window and tab preferences. Each of these reads or writes exactly one
// registered pref in redrob::prefs and does nothing else -- no window is
// relaid out, no tab strip is rebuilt, because nothing on the native side
// reads these prefs yet. See the block comment in redrob_private.idl.

class RedrobPrivateGetVerticalTabInsertionPositionFunction
    : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.getVerticalTabInsertionPosition",
                             REDROBPRIVATE_GETVERTICALTABINSERTIONPOSITION)
 protected:
  ~RedrobPrivateGetVerticalTabInsertionPositionFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateSetVerticalTabInsertionPositionFunction
    : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.setVerticalTabInsertionPosition",
                             REDROBPRIVATE_SETVERTICALTABINSERTIONPOSITION)
 protected:
  ~RedrobPrivateSetVerticalTabInsertionPositionFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateGetHorizontalTabShrinkEnabledFunction
    : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.getHorizontalTabShrinkEnabled",
                             REDROBPRIVATE_GETHORIZONTALTABSHRINKENABLED)
 protected:
  ~RedrobPrivateGetHorizontalTabShrinkEnabledFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateSetHorizontalTabShrinkEnabledFunction
    : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.setHorizontalTabShrinkEnabled",
                             REDROBPRIVATE_SETHORIZONTALTABSHRINKENABLED)
 protected:
  ~RedrobPrivateSetHorizontalTabShrinkEnabledFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateGetWindowTranslucencyEnabledFunction
    : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.getWindowTranslucencyEnabled",
                             REDROBPRIVATE_GETWINDOWTRANSLUCENCYENABLED)
 protected:
  ~RedrobPrivateGetWindowTranslucencyEnabledFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateSetWindowTranslucencyEnabledFunction
    : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.setWindowTranslucencyEnabled",
                             REDROBPRIVATE_SETWINDOWTRANSLUCENCYENABLED)
 protected:
  ~RedrobPrivateSetWindowTranslucencyEnabledFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateGetAutomaticPictureInPictureEnabledFunction
    : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION(
      "redrobPrivate.getAutomaticPictureInPictureEnabled",
      REDROBPRIVATE_GETAUTOMATICPICTUREINPICTUREENABLED)
 protected:
  ~RedrobPrivateGetAutomaticPictureInPictureEnabledFunction() override =
      default;
  ResponseAction Run() override;
};

class RedrobPrivateSetAutomaticPictureInPictureEnabledFunction
    : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION(
      "redrobPrivate.setAutomaticPictureInPictureEnabled",
      REDROBPRIVATE_SETAUTOMATICPICTUREINPICTUREENABLED)
 protected:
  ~RedrobPrivateSetAutomaticPictureInPictureEnabledFunction() override =
      default;
  ResponseAction Run() override;
};

class RedrobPrivateGetColorSchemeFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.getColorScheme",
                             REDROBPRIVATE_GETCOLORSCHEME)

 protected:
  ~RedrobPrivateGetColorSchemeFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateSetColorSchemeFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.setColorScheme",
                             REDROBPRIVATE_SETCOLORSCHEME)

 protected:
  ~RedrobPrivateSetColorSchemeFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateSetRpcEnabledFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.setRpcEnabled",
                             REDROBPRIVATE_SETRPCENABLED)
 protected:
  ~RedrobPrivateSetRpcEnabledFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateClearWorkingFolderFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.clearWorkingFolder",
                             REDROBPRIVATE_CLEARWORKINGFOLDER)
 protected:
  ~RedrobPrivateClearWorkingFolderFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateAddRoutineFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.addRoutine",
                             REDROBPRIVATE_ADDROUTINE)
 protected:
  ~RedrobPrivateAddRoutineFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateUpdateRoutineFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.updateRoutine",
                             REDROBPRIVATE_UPDATEROUTINE)
 protected:
  ~RedrobPrivateUpdateRoutineFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateRunRoutineNowFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.runRoutineNow",
                             REDROBPRIVATE_RUNROUTINENOW)
 protected:
  ~RedrobPrivateRunRoutineNowFunction() override = default;
  ResponseAction Run() override;
};

// The three below answer AFTER Run() returns, so each holds a reference to
// itself in the callback it hands out. That is why they declare an OnDone
// rather than doing the work inline.
class RedrobPrivateChooseWorkingFolderFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.chooseWorkingFolder",
                             REDROBPRIVATE_CHOOSEWORKINGFOLDER)
 protected:
  ~RedrobPrivateChooseWorkingFolderFunction() override = default;
  ResponseAction Run() override;

 private:
  void OnFolderChosen(const base::FilePath& path);
};

class RedrobPrivateBeginProviderSignInFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.beginProviderSignIn",
                             REDROBPRIVATE_BEGINPROVIDERSIGNIN)
 protected:
  ~RedrobPrivateBeginProviderSignInFunction() override = default;
  ResponseAction Run() override;

 private:
  void OnAuthorizeUrl(const GURL& authorize, const std::string& error);
};

class RedrobPrivateOpenPasswordManagerFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.openPasswordManager",
                             REDROBPRIVATE_OPENPASSWORDMANAGER)
 protected:
  ~RedrobPrivateOpenPasswordManagerFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateListModelsFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.listModels",
                             REDROBPRIVATE_LISTMODELS)
 protected:
  ~RedrobPrivateListModelsFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateListTasksFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.listTasks", REDROBPRIVATE_LISTTASKS)
 protected:
  ~RedrobPrivateListTasksFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateGetTaskFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.getTask", REDROBPRIVATE_GETTASK)
 protected:
  ~RedrobPrivateGetTaskFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateCancelTaskFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.cancelTask",
                             REDROBPRIVATE_CANCELTASK)
 protected:
  ~RedrobPrivateCancelTaskFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateSetPermissionModeFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.setPermissionMode",
                             REDROBPRIVATE_SETPERMISSIONMODE)
 protected:
  ~RedrobPrivateSetPermissionModeFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateWithdrawQueuedFollowUpFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.withdrawQueuedFollowUp",
                             REDROBPRIVATE_WITHDRAWQUEUEDFOLLOWUP)
 protected:
  ~RedrobPrivateWithdrawQueuedFollowUpFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateSearchWithDefaultProviderFunction
    : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.searchWithDefaultProvider",
                             REDROBPRIVATE_SEARCHWITHDEFAULTPROVIDER)
 protected:
  ~RedrobPrivateSearchWithDefaultProviderFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateStartTaskFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.startTask", REDROBPRIVATE_STARTTASK)
 protected:
  ~RedrobPrivateStartTaskFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateSendFollowUpFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.sendFollowUp",
                             REDROBPRIVATE_SENDFOLLOWUP)
 protected:
  ~RedrobPrivateSendFollowUpFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateChooseTaskWorkingFolderFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.chooseTaskWorkingFolder",
                             REDROBPRIVATE_CHOOSETASKWORKINGFOLDER)
 protected:
  ~RedrobPrivateChooseTaskWorkingFolderFunction() override = default;
  ResponseAction Run() override;

 private:
  void OnFolderChosen(const std::string& task_id, const base::FilePath& path);
};

class RedrobPrivateGetEngineCredentialFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.getEngineCredential",
                             REDROBPRIVATE_GETENGINECREDENTIAL)
 protected:
  ~RedrobPrivateGetEngineCredentialFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateGetEngineInstallStateFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.getEngineInstallState",
                             REDROBPRIVATE_GETENGINEINSTALLSTATE)
 protected:
  ~RedrobPrivateGetEngineInstallStateFunction() override = default;
  ResponseAction Run() override;

 private:
  void OnState(api::redrob_private::EngineInstallInfo info);
};

class RedrobPrivateInstallEngineFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.installEngine",
                             REDROBPRIVATE_INSTALLENGINE)
 protected:
  ~RedrobPrivateInstallEngineFunction() override = default;
  ResponseAction Run() override;
};

// --- Memory files (CAP-19) ---------------------------------------------------

class RedrobPrivateReadMemoryFileFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.readMemoryFile",
                             REDROBPRIVATE_READMEMORYFILE)
 protected:
  ~RedrobPrivateReadMemoryFileFunction() override = default;
  ResponseAction Run() override;

 private:
  void OnRead(std::optional<std::string> content);
};

class RedrobPrivateWriteMemoryFileFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.writeMemoryFile",
                             REDROBPRIVATE_WRITEMEMORYFILE)
 protected:
  ~RedrobPrivateWriteMemoryFileFunction() override = default;
  ResponseAction Run() override;

 private:
  void OnDone(std::string run_id, bool ok, const std::string& message);
};

class RedrobPrivateRevertMemoryRunFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.revertMemoryRun",
                             REDROBPRIVATE_REVERTMEMORYRUN)
 protected:
  ~RedrobPrivateRevertMemoryRunFunction() override = default;
  ResponseAction Run() override;

 private:
  void OnDone(bool ok, const std::string& message);
};

class RedrobPrivateRunMemoryConsolidationFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.runMemoryConsolidation",
                             REDROBPRIVATE_RUNMEMORYCONSOLIDATION)
 protected:
  ~RedrobPrivateRunMemoryConsolidationFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateSetMemoryHistoryInputFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.setMemoryHistoryInput",
                             REDROBPRIVATE_SETMEMORYHISTORYINPUT)
 protected:
  ~RedrobPrivateSetMemoryHistoryInputFunction() override = default;
  ResponseAction Run() override;
};

// --- CAP-4 / SUB-1..4 (feat/parity-run) ------------------------------------

class RedrobPrivateGetKeepTasksRunningFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.getKeepTasksRunning",
                             REDROBPRIVATE_GETKEEPTASKSRUNNING)
 protected:
  ~RedrobPrivateGetKeepTasksRunningFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateSetKeepTasksRunningFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.setKeepTasksRunning",
                             REDROBPRIVATE_SETKEEPTASKSRUNNING)
 protected:
  ~RedrobPrivateSetKeepTasksRunningFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateAnswerTaskConfirmationFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.answerTaskConfirmation",
                             REDROBPRIVATE_ANSWERTASKCONFIRMATION)
 protected:
  ~RedrobPrivateAnswerTaskConfirmationFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateGetEngineAccountFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.getEngineAccount",
                             REDROBPRIVATE_GETENGINEACCOUNT)
 protected:
  ~RedrobPrivateGetEngineAccountFunction() override = default;
  ResponseAction Run() override;

 private:
  void OnAccount(redrob::TaskStore::EngineAccount account);
};

class RedrobPrivateBeginEngineSignInFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.beginEngineSignIn",
                             REDROBPRIVATE_BEGINENGINESIGNIN)
 protected:
  ~RedrobPrivateBeginEngineSignInFunction() override = default;
  ResponseAction Run() override;

 private:
  void OnStarted(redrob::TaskStore::SignInStart start);
};

class RedrobPrivateFinishEngineSignInFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.finishEngineSignIn",
                             REDROBPRIVATE_FINISHENGINESIGNIN)
 protected:
  ~RedrobPrivateFinishEngineSignInFunction() override = default;
  ResponseAction Run() override;

 private:
  void OnDone(std::string error);
};

class RedrobPrivateSetEngineProviderKeyFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.setEngineProviderKey",
                             REDROBPRIVATE_SETENGINEPROVIDERKEY)
 protected:
  ~RedrobPrivateSetEngineProviderKeyFunction() override = default;
  ResponseAction Run() override;

 private:
  void OnDone(std::string error);
};

class RedrobPrivateDisconnectEngineProviderFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.disconnectEngineProvider",
                             REDROBPRIVATE_DISCONNECTENGINEPROVIDER)
 protected:
  ~RedrobPrivateDisconnectEngineProviderFunction() override = default;
  ResponseAction Run() override;

 private:
  void OnDone(bool ok);
};

// --- Agent sign-in (CAP-9). See chrome/browser/redrob/credential_tools.h. ---

class RedrobPrivateGetAgentCredentialSettingsFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.getAgentCredentialSettings",
                             REDROBPRIVATE_GETAGENTCREDENTIALSETTINGS)
 protected:
  ~RedrobPrivateGetAgentCredentialSettingsFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateSetAgentCredentialPolicyFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.setAgentCredentialPolicy",
                             REDROBPRIVATE_SETAGENTCREDENTIALPOLICY)
 protected:
  ~RedrobPrivateSetAgentCredentialPolicyFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateSetAgentCredentialUnlockMinutesFunction
    : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.setAgentCredentialUnlockMinutes",
                             REDROBPRIVATE_SETAGENTCREDENTIALUNLOCKMINUTES)
 protected:
  ~RedrobPrivateSetAgentCredentialUnlockMinutesFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateSetAgentCredentialSiteFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.setAgentCredentialSite",
                             REDROBPRIVATE_SETAGENTCREDENTIALSITE)
 protected:
  ~RedrobPrivateSetAgentCredentialSiteFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateRemoveAgentCredentialSiteFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.removeAgentCredentialSite",
                             REDROBPRIVATE_REMOVEAGENTCREDENTIALSITE)
 protected:
  ~RedrobPrivateRemoveAgentCredentialSiteFunction() override = default;
  ResponseAction Run() override;
};

// Answers after the OS prompt closes, so it holds itself in the callback.
class RedrobPrivateUnlockAgentCredentialsFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.unlockAgentCredentials",
                             REDROBPRIVATE_UNLOCKAGENTCREDENTIALS)
 protected:
  ~RedrobPrivateUnlockAgentCredentialsFunction() override = default;
  ResponseAction Run() override;

 private:
  void OnUnlocked(bool unlocked);
};

class RedrobPrivateLockAgentCredentialsFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.lockAgentCredentials",
                             REDROBPRIVATE_LOCKAGENTCREDENTIALS)
 protected:
  ~RedrobPrivateLockAgentCredentialsFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateResumeCredentialTaskFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.resumeCredentialTask",
                             REDROBPRIVATE_RESUMECREDENTIALTASK)
 protected:
  ~RedrobPrivateResumeCredentialTaskFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateClearAgentCredentialHistoryFunction
    : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.clearAgentCredentialHistory",
                             REDROBPRIVATE_CLEARAGENTCREDENTIALHISTORY)
 protected:
  ~RedrobPrivateClearAgentCredentialHistoryFunction() override = default;
  ResponseAction Run() override;
};

// --- Native entrances: the quick window (CAP-5) ------------------------------

class RedrobPrivateGetQuickWindowShortcutFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.getQuickWindowShortcut",
                             REDROBPRIVATE_GETQUICKWINDOWSHORTCUT)
 protected:
  ~RedrobPrivateGetQuickWindowShortcutFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateSetQuickWindowShortcutFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.setQuickWindowShortcut",
                             REDROBPRIVATE_SETQUICKWINDOWSHORTCUT)
 protected:
  ~RedrobPrivateSetQuickWindowShortcutFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateStartQuickTaskFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.startQuickTask",
                             REDROBPRIVATE_STARTQUICKTASK)
 protected:
  ~RedrobPrivateStartQuickTaskFunction() override = default;
  ResponseAction Run() override;
};

class RedrobPrivateCloseQuickWindowFunction : public ExtensionFunction {
 public:
  DECLARE_EXTENSION_FUNCTION("redrobPrivate.closeQuickWindow",
                             REDROBPRIVATE_CLOSEQUICKWINDOW)
 protected:
  ~RedrobPrivateCloseQuickWindowFunction() override = default;
  ResponseAction Run() override;
};

}  // namespace extensions

#endif  // CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_API_H_
