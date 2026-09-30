// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/extensions/api/redrob_private/redrob_private_task_event_router_factory.h"

#include "chrome/browser/extensions/api/redrob_private/redrob_private_task_event_router.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/profiles/profile_selections.h"
#include "chrome/browser/redrob/task_store_factory.h"
#include "extensions/browser/event_router_factory.h"

namespace extensions {

// static
RedrobPrivateTaskEventRouter*
RedrobPrivateTaskEventRouterFactory::GetForProfile(Profile* profile) {
  return static_cast<RedrobPrivateTaskEventRouter*>(
      GetInstance()->GetServiceForBrowserContext(profile, /*create=*/true));
}

// static
RedrobPrivateTaskEventRouterFactory*
RedrobPrivateTaskEventRouterFactory::GetInstance() {
  static base::NoDestructor<RedrobPrivateTaskEventRouterFactory> factory;
  return factory.get();
}

RedrobPrivateTaskEventRouterFactory::RedrobPrivateTaskEventRouterFactory()
    : ProfileKeyedServiceFactory(
          "RedrobPrivateTaskEventRouter",
          ProfileSelections::Builder()
              .WithRegular(ProfileSelection::kOwnInstance)
              .WithAshInternals(ProfileSelection::kOwnInstance)
              .Build()) {
  DependsOn(EventRouterFactory::GetInstance());
  // The store it observes must outlive it, so the dependency is declared rather
  // than assumed from construction order.
  DependsOn(redrob::TaskStoreFactory::GetInstance());
}

RedrobPrivateTaskEventRouterFactory::~RedrobPrivateTaskEventRouterFactory() =
    default;

std::unique_ptr<KeyedService>
RedrobPrivateTaskEventRouterFactory::BuildServiceInstanceForBrowserContext(
    content::BrowserContext* context) const {
  return std::make_unique<RedrobPrivateTaskEventRouter>(context);
}

bool RedrobPrivateTaskEventRouterFactory::ServiceIsCreatedWithBrowserContext()
    const {
  // Not lazy: an observer created on first use misses every task change before
  // that, including the start of the first task.
  return true;
}

}  // namespace extensions
