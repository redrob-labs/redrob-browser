// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/extensions/api/redrob_private/redrob_private_saved_secrets_factory.h"

#include "chrome/browser/autofill/personal_data_manager_factory.h"
#include "chrome/browser/extensions/api/redrob_private/redrob_private_saved_secrets.h"
#include "chrome/browser/password_manager/account_password_store_factory.h"
#include "chrome/browser/password_manager/profile_password_store_factory.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/profiles/profile_selections.h"

namespace extensions {

// static
RedrobPrivateSavedSecrets*
RedrobPrivateSavedSecretsFactory::GetForBrowserContext(
    content::BrowserContext* context) {
  return static_cast<RedrobPrivateSavedSecrets*>(
      GetInstance()->GetServiceForBrowserContext(context, /*create=*/true));
}

// static
RedrobPrivateSavedSecretsFactory*
RedrobPrivateSavedSecretsFactory::GetInstance() {
  static base::NoDestructor<RedrobPrivateSavedSecretsFactory> factory;
  return factory.get();
}

RedrobPrivateSavedSecretsFactory::RedrobPrivateSavedSecretsFactory()
    : ProfileKeyedServiceFactory(
          "RedrobPrivateSavedSecrets",
          ProfileSelections::Builder()
              .WithRegular(ProfileSelection::kRedirectedToOriginal)
              .WithGuest(ProfileSelection::kNone)
              .Build()) {
  DependsOn(ProfilePasswordStoreFactory::GetInstance());
  DependsOn(AccountPasswordStoreFactory::GetInstance());
  DependsOn(autofill::PersonalDataManagerFactory::GetInstance());
}

RedrobPrivateSavedSecretsFactory::~RedrobPrivateSavedSecretsFactory() =
    default;

std::unique_ptr<KeyedService>
RedrobPrivateSavedSecretsFactory::BuildServiceInstanceForBrowserContext(
    content::BrowserContext* context) const {
  return std::make_unique<RedrobPrivateSavedSecrets>(
      Profile::FromBrowserContext(context));
}

}  // namespace extensions
