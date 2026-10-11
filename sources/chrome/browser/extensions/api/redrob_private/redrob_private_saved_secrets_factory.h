// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_SAVED_SECRETS_FACTORY_H_
#define CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_SAVED_SECRETS_FACTORY_H_

#include "base/no_destructor.h"
#include "chrome/browser/profiles/profile_keyed_service_factory.h"

namespace content {
class BrowserContext;
}  // namespace content

namespace extensions {

class RedrobPrivateSavedSecrets;

// One RedrobPrivateSavedSecrets per regular profile. An incognito profile is redirected to its
// original, whose stores are the ones it autofills from. Created lazily, on the first scan, so a
// person who never uses the agent never has their passwords read into it.
class RedrobPrivateSavedSecretsFactory : public ProfileKeyedServiceFactory {
 public:
  RedrobPrivateSavedSecretsFactory(const RedrobPrivateSavedSecretsFactory&) =
      delete;
  RedrobPrivateSavedSecretsFactory& operator=(
      const RedrobPrivateSavedSecretsFactory&) = delete;

  static RedrobPrivateSavedSecrets* GetForBrowserContext(
      content::BrowserContext* context);
  static RedrobPrivateSavedSecretsFactory* GetInstance();

 private:
  friend base::NoDestructor<RedrobPrivateSavedSecretsFactory>;

  RedrobPrivateSavedSecretsFactory();
  ~RedrobPrivateSavedSecretsFactory() override;

  // BrowserContextKeyedServiceFactory:
  std::unique_ptr<KeyedService> BuildServiceInstanceForBrowserContext(
      content::BrowserContext* context) const override;
};

}  // namespace extensions

#endif  // CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_SAVED_SECRETS_FACTORY_H_
