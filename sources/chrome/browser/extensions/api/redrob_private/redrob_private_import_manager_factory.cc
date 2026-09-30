// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/extensions/api/redrob_private/redrob_private_import_manager_factory.h"

#include "chrome/browser/extensions/api/redrob_private/redrob_private_import_manager.h"
#include "chrome/browser/profiles/profile_selections.h"
#include "extensions/browser/event_router_factory.h"

namespace extensions {

// static
RedrobPrivateImportManager*
RedrobPrivateImportManagerFactory::GetForBrowserContext(
    content::BrowserContext* context) {
  return static_cast<RedrobPrivateImportManager*>(
      GetInstance()->GetServiceForBrowserContext(context, /*create=*/true));
}

// static
RedrobPrivateImportManagerFactory*
RedrobPrivateImportManagerFactory::GetInstance() {
  static base::NoDestructor<RedrobPrivateImportManagerFactory> factory;
  return factory.get();
}

RedrobPrivateImportManagerFactory::RedrobPrivateImportManagerFactory()
    : ProfileKeyedServiceFactory(
          "RedrobPrivateImportManager",
          ProfileSelections::Builder()
              .WithRegular(ProfileSelection::kOwnInstance)
              .WithAshInternals(ProfileSelection::kOwnInstance)
              .Build()) {
  DependsOn(EventRouterFactory::GetInstance());
}

RedrobPrivateImportManagerFactory::~RedrobPrivateImportManagerFactory() =
    default;

std::unique_ptr<KeyedService>
RedrobPrivateImportManagerFactory::BuildServiceInstanceForBrowserContext(
    content::BrowserContext* context) const {
  return std::make_unique<RedrobPrivateImportManager>(context);
}

}  // namespace extensions
