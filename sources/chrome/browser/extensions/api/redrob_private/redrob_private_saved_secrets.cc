// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/extensions/api/redrob_private/redrob_private_saved_secrets.h"

#include <utility>

#include "chrome/browser/autofill/personal_data_manager_factory.h"
#include "chrome/browser/password_manager/account_password_store_factory.h"
#include "chrome/browser/password_manager/profile_password_store_factory.h"
#include "chrome/browser/profiles/profile.h"
#include "components/autofill/core/browser/data_manager/addresses/address_data_manager.h"
#include "components/autofill/core/browser/data_manager/payments/payments_data_manager.h"
#include "components/autofill/core/browser/data_manager/personal_data_manager.h"
#include "components/autofill/core/browser/data_model/addresses/autofill_profile.h"
#include "components/autofill/core/browser/data_model/payments/credit_card.h"
#include "components/autofill/core/browser/field_types.h"
#include "components/keyed_service/core/service_access_type.h"
#include "components/password_manager/core/browser/password_form.h"
#include "components/password_manager/core/browser/password_store/password_store_util.h"

namespace extensions {

namespace {

using Kind = redrob::SecretMatcher::Kind;

// The autofill fields that identify a person. Not every field: a saved city or country names
// thousands of people, and marking it would hide what a page is about without protecting anyone.
constexpr std::pair<autofill::FieldType, Kind> kProfileFields[] = {
    {autofill::NAME_FULL, Kind::kName},
    {autofill::EMAIL_ADDRESS, Kind::kEmail},
    {autofill::PHONE_HOME_WHOLE_NUMBER, Kind::kPhone},
    {autofill::PHONE_HOME_CITY_AND_NUMBER, Kind::kPhone},
    {autofill::ADDRESS_HOME_STREET_ADDRESS, Kind::kAddress},
    {autofill::ADDRESS_HOME_LINE1, Kind::kAddress},
};

}  // namespace

RedrobPrivateSavedSecrets::RedrobPrivateSavedSecrets(Profile* profile)
    : profile_(profile),
      matcher_(std::make_unique<redrob::SecretMatcher>()) {
  for (auto store :
       {ProfilePasswordStoreFactory::GetForProfile(
            profile, ServiceAccessType::EXPLICIT_ACCESS),
        AccountPasswordStoreFactory::GetForProfile(
            profile, ServiceAccessType::EXPLICIT_ACCESS)}) {
    if (!store) {
      continue;
    }
    store_observations_.AddObservation(store.get());
    stores_.push_back(std::move(store));
  }
  personal_data_ =
      autofill::PersonalDataManagerFactory::GetForBrowserContext(profile);
  if (personal_data_) {
    personal_data_observation_.Observe(personal_data_.get());
  }
  Rebuild();
}

RedrobPrivateSavedSecrets::~RedrobPrivateSavedSecrets() = default;

void RedrobPrivateSavedSecrets::Shutdown() {
  rebuild_weak_factory_.InvalidateWeakPtrs();
  store_observations_.RemoveAllObservations();
  personal_data_observation_.Reset();
  personal_data_ = nullptr;
  stores_.clear();
  building_.reset();
  matcher_ = std::make_unique<redrob::SecretMatcher>();
}

std::vector<redrob::SecretMatcher::Span> RedrobPrivateSavedSecrets::Scan(
    std::u16string_view text) const {
  return matcher_->Scan(text);
}

void RedrobPrivateSavedSecrets::Rebuild() {
  rebuild_weak_factory_.InvalidateWeakPtrs();
  building_ = std::make_unique<redrob::SecretMatcher>();

  if (personal_data_) {
    for (const autofill::AutofillProfile* entry :
         personal_data_->address_data_manager().GetProfiles()) {
      for (const auto& [field, kind] : kProfileFields) {
        building_->AddValue(kind, entry->GetRawInfo(field));
      }
    }
    for (const autofill::CreditCard* card :
         personal_data_->payments_data_manager().GetCreditCards()) {
      // Server cards are masked locally; only a full number is a number to find.
      if (card->record_type() == autofill::CreditCard::RecordType::kLocalCard) {
        building_->AddValue(Kind::kCard, card->number());
      }
    }
  }

  pending_stores_ = static_cast<int>(stores_.size());
  for (const auto& store : stores_) {
    store->GetAutofillableLogins(rebuild_weak_factory_.GetWeakPtr());
  }
  MaybeFinish();
}

void RedrobPrivateSavedSecrets::MaybeFinish() {
  if (pending_stores_ > 0 || !building_) {
    return;
  }
  matcher_ = std::move(building_);
  ready_ = true;
}

void RedrobPrivateSavedSecrets::OnGetPasswordStoreResultsOrErrorFrom(
    password_manager::PasswordStoreInterface* store,
    password_manager::LoginsResultOrError results_or_error) {
  if (!building_) {
    return;
  }
  // A store that failed to read contributes nothing rather than failing the whole matcher: the
  // other store and autofill still protect what they hold.
  for (const password_manager::PasswordForm& form :
       password_manager::GetLoginsOrEmptyListOnFailure(
           std::move(results_or_error))) {
    if (!form.blocked_by_user && !form.password_value.empty()) {
      building_->AddPassword(form.password_value);
    }
  }
  --pending_stores_;
  MaybeFinish();
}

void RedrobPrivateSavedSecrets::OnLoginsChanged(
    password_manager::PasswordStoreInterface* store,
    const password_manager::PasswordStoreChangeList& changes) {
  Rebuild();
}

void RedrobPrivateSavedSecrets::OnLoginsRetained(
    password_manager::PasswordStoreInterface* store,
    const std::vector<password_manager::PasswordForm>& retained) {
  Rebuild();
}

void RedrobPrivateSavedSecrets::OnPersonalDataChanged() {
  Rebuild();
}

}  // namespace extensions
