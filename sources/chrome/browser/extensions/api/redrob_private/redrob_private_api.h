// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_API_H_
#define CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_API_H_

#include <memory>

#include "chrome/browser/importer/importer_list.h"
#include "extensions/browser/extension_function.h"

namespace extensions {

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

}  // namespace extensions

#endif  // CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_API_H_
