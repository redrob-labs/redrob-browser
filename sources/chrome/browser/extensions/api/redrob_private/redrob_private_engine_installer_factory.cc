// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/extensions/api/redrob_private/redrob_private_engine_installer_factory.h"

#include "chrome/browser/extensions/api/redrob_private/redrob_private_engine_installer.h"
#include "chrome/browser/profiles/profile_selections.h"
#include "extensions/browser/event_router_factory.h"

namespace extensions {

// static
RedrobPrivateEngineInstaller*
RedrobPrivateEngineInstallerFactory::GetForBrowserContext(
    content::BrowserContext* context) {
  return static_cast<RedrobPrivateEngineInstaller*>(
      GetInstance()->GetServiceForBrowserContext(context, /*create=*/true));
}

// static
RedrobPrivateEngineInstallerFactory*
RedrobPrivateEngineInstallerFactory::GetInstance() {
  static base::NoDestructor<RedrobPrivateEngineInstallerFactory> factory;
  return factory.get();
}

RedrobPrivateEngineInstallerFactory::RedrobPrivateEngineInstallerFactory()
    : ProfileKeyedServiceFactory(
          "RedrobPrivateEngineInstaller",
          ProfileSelections::Builder()
              .WithRegular(ProfileSelection::kOwnInstance)
              .WithAshInternals(ProfileSelection::kOwnInstance)
              .Build()) {
  DependsOn(EventRouterFactory::GetInstance());
}

RedrobPrivateEngineInstallerFactory::~RedrobPrivateEngineInstallerFactory() =
    default;

std::unique_ptr<KeyedService>
RedrobPrivateEngineInstallerFactory::BuildServiceInstanceForBrowserContext(
    content::BrowserContext* context) const {
  return std::make_unique<RedrobPrivateEngineInstaller>(context);
}

}  // namespace extensions
