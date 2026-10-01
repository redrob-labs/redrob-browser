// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/extensions/api/redrob_private/redrob_private_onboarding_service_factory.h"

#include "chrome/browser/extensions/api/redrob_private/redrob_private_onboarding_service.h"
#include "chrome/browser/profiles/profile_selections.h"

namespace extensions {

// static
RedrobPrivateOnboardingService*
RedrobPrivateOnboardingServiceFactory::GetForBrowserContext(
    content::BrowserContext* context) {
  return static_cast<RedrobPrivateOnboardingService*>(
      GetInstance()->GetServiceForBrowserContext(context, /*create=*/true));
}

// static
RedrobPrivateOnboardingServiceFactory*
RedrobPrivateOnboardingServiceFactory::GetInstance() {
  static base::NoDestructor<RedrobPrivateOnboardingServiceFactory> factory;
  return factory.get();
}

RedrobPrivateOnboardingServiceFactory::RedrobPrivateOnboardingServiceFactory()
    : ProfileKeyedServiceFactory(
          "RedrobPrivateOnboardingService",
          ProfileSelections::Builder()
              .WithRegular(ProfileSelection::kOwnInstance)
              .WithAshInternals(ProfileSelection::kOwnInstance)
              .Build()) {}

RedrobPrivateOnboardingServiceFactory::
    ~RedrobPrivateOnboardingServiceFactory() = default;

std::unique_ptr<KeyedService>
RedrobPrivateOnboardingServiceFactory::BuildServiceInstanceForBrowserContext(
    content::BrowserContext* context) const {
  return std::make_unique<RedrobPrivateOnboardingService>();
}

bool RedrobPrivateOnboardingServiceFactory::ServiceIsCreatedWithBrowserContext()
    const {
  // The first-run window must be able to install its completion callback before
  // the page runs, so the service exists as soon as the context does.
  return true;
}

}  // namespace extensions
