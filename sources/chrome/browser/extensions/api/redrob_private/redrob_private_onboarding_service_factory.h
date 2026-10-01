// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_ONBOARDING_SERVICE_FACTORY_H_
#define CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_ONBOARDING_SERVICE_FACTORY_H_

#include "base/no_destructor.h"
#include "chrome/browser/profiles/profile_keyed_service_factory.h"

namespace content {
class BrowserContext;
}  // namespace content

namespace extensions {

class RedrobPrivateOnboardingService;

// One RedrobPrivateOnboardingService per profile, so the callback the first-run
// window installs is the one the extension page's completeOnboarding fires.
// Created with the browser context, not lazily: the first-run window needs to
// install its callback before the page has run anything.
class RedrobPrivateOnboardingServiceFactory : public ProfileKeyedServiceFactory {
 public:
  RedrobPrivateOnboardingServiceFactory(
      const RedrobPrivateOnboardingServiceFactory&) = delete;
  RedrobPrivateOnboardingServiceFactory& operator=(
      const RedrobPrivateOnboardingServiceFactory&) = delete;

  static RedrobPrivateOnboardingService* GetForBrowserContext(
      content::BrowserContext* context);

  static RedrobPrivateOnboardingServiceFactory* GetInstance();

 private:
  friend base::NoDestructor<RedrobPrivateOnboardingServiceFactory>;

  RedrobPrivateOnboardingServiceFactory();
  ~RedrobPrivateOnboardingServiceFactory() override;

  // BrowserContextKeyedServiceFactory:
  std::unique_ptr<KeyedService> BuildServiceInstanceForBrowserContext(
      content::BrowserContext* context) const override;
  bool ServiceIsCreatedWithBrowserContext() const override;
};

}  // namespace extensions

#endif  // CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_ONBOARDING_SERVICE_FACTORY_H_
