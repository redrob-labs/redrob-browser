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

}  // namespace extensions

#endif  // CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_API_H_
