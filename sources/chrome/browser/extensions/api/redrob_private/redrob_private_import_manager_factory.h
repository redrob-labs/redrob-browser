// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_IMPORT_MANAGER_FACTORY_H_
#define CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_IMPORT_MANAGER_FACTORY_H_

#include "base/no_destructor.h"
#include "chrome/browser/profiles/profile_keyed_service_factory.h"

namespace content {
class BrowserContext;
}  // namespace content

namespace extensions {

class RedrobPrivateImportManager;

// Instantiates one RedrobPrivateImportManager per profile, lazily: the manager
// exists only once an extension calls startImport, so the service is NOT
// created with the browser context.
class RedrobPrivateImportManagerFactory : public ProfileKeyedServiceFactory {
 public:
  RedrobPrivateImportManagerFactory(const RedrobPrivateImportManagerFactory&) =
      delete;
  RedrobPrivateImportManagerFactory& operator=(
      const RedrobPrivateImportManagerFactory&) = delete;

  // Returns the manager for `context`, creating it if needed.
  static RedrobPrivateImportManager* GetForBrowserContext(
      content::BrowserContext* context);

  static RedrobPrivateImportManagerFactory* GetInstance();

 private:
  friend base::NoDestructor<RedrobPrivateImportManagerFactory>;

  RedrobPrivateImportManagerFactory();
  ~RedrobPrivateImportManagerFactory() override;

  // BrowserContextKeyedServiceFactory:
  std::unique_ptr<KeyedService> BuildServiceInstanceForBrowserContext(
      content::BrowserContext* context) const override;
};

}  // namespace extensions

#endif  // CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_IMPORT_MANAGER_FACTORY_H_
