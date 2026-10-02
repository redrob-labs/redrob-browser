// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_ENGINE_INSTALLER_FACTORY_H_
#define CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_ENGINE_INSTALLER_FACTORY_H_

#include <memory>

#include "base/no_destructor.h"
#include "chrome/browser/profiles/profile_keyed_service_factory.h"

namespace content {
class BrowserContext;
}  // namespace content

namespace extensions {

class RedrobPrivateEngineInstaller;

// Instantiates one RedrobPrivateEngineInstaller per profile, lazily: nothing
// exists until an extension asks about the engine, which is the same shape as
// RedrobPrivateImportManagerFactory and for the same reason -- a browser whose
// user never opens onboarding should not carry an installer.
class RedrobPrivateEngineInstallerFactory : public ProfileKeyedServiceFactory {
 public:
  RedrobPrivateEngineInstallerFactory(
      const RedrobPrivateEngineInstallerFactory&) = delete;
  RedrobPrivateEngineInstallerFactory& operator=(
      const RedrobPrivateEngineInstallerFactory&) = delete;

  // Returns the installer for `context`, creating it if needed.
  static RedrobPrivateEngineInstaller* GetForBrowserContext(
      content::BrowserContext* context);

  static RedrobPrivateEngineInstallerFactory* GetInstance();

 private:
  friend base::NoDestructor<RedrobPrivateEngineInstallerFactory>;

  RedrobPrivateEngineInstallerFactory();
  ~RedrobPrivateEngineInstallerFactory() override;

  // BrowserContextKeyedServiceFactory:
  std::unique_ptr<KeyedService> BuildServiceInstanceForBrowserContext(
      content::BrowserContext* context) const override;
};

}  // namespace extensions

#endif  // CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_ENGINE_INSTALLER_FACTORY_H_
