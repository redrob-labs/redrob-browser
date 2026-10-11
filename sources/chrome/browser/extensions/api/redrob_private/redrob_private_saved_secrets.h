// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_SAVED_SECRETS_H_
#define CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_SAVED_SECRETS_H_

#include <memory>
#include <string_view>
#include <vector>

#include "base/memory/raw_ptr.h"
#include "base/memory/scoped_refptr.h"
#include "base/memory/weak_ptr.h"
#include "base/scoped_multi_source_observation.h"
#include "base/scoped_observation.h"
#include "chrome/browser/redrob/secret_matcher.h"
#include "components/autofill/core/browser/data_manager/personal_data_manager_observer.h"
#include "components/keyed_service/core/keyed_service.h"
#include "components/password_manager/core/browser/password_store/password_store_consumer.h"
#include "components/password_manager/core/browser/password_store/password_store_interface.h"

class Profile;

namespace autofill {
class PersonalDataManager;
}  // namespace autofill

namespace extensions {

// Privacy Protection's view of what this person saved in the browser: one SecretMatcher, kept current
// from the profile's password stores (local and account) and its autofill data, and asked by
// redrobPrivate.scanForSavedSecrets where any of it occurs in a piece of text.
//
// The values are read from the stores into a matcher that keeps only keyed digests, and the forms the
// stores hand back are dropped as soon as they are read; nothing here writes to disk, logs, or returns
// a value. Rebuilt whole on any change -- a few hundred digests -- so an edit or a deletion in the
// password manager is reflected in the next scan without bookkeeping that could drift.
//
// Regular profiles only: an incognito profile's password store is the regular one's, and it is the
// regular profile's service that answers for it (see the factory).
class RedrobPrivateSavedSecrets
    : public KeyedService,
      public password_manager::PasswordStoreConsumer,
      public password_manager::PasswordStoreInterface::Observer,
      public autofill::PersonalDataManagerObserver {
 public:
  explicit RedrobPrivateSavedSecrets(Profile* profile);
  RedrobPrivateSavedSecrets(const RedrobPrivateSavedSecrets&) = delete;
  RedrobPrivateSavedSecrets& operator=(const RedrobPrivateSavedSecrets&) = delete;
  ~RedrobPrivateSavedSecrets() override;

  // False until the first build has read every store, so a caller can tell "nothing saved matches"
  // from "not ready yet".
  bool ready() const { return ready_; }

  std::vector<redrob::SecretMatcher::Span> Scan(std::u16string_view text) const;

  // KeyedService:
  void Shutdown() override;

 private:
  void Rebuild();
  void MaybeFinish();

  // password_manager::PasswordStoreConsumer:
  void OnGetPasswordStoreResultsOrErrorFrom(
      password_manager::PasswordStoreInterface* store,
      password_manager::LoginsResultOrError results_or_error) override;

  // password_manager::PasswordStoreInterface::Observer:
  void OnLoginsChanged(
      password_manager::PasswordStoreInterface* store,
      const password_manager::PasswordStoreChangeList& changes) override;
  void OnLoginsRetained(
      password_manager::PasswordStoreInterface* store,
      const std::vector<password_manager::PasswordForm>& retained) override;

  // autofill::PersonalDataManagerObserver:
  void OnPersonalDataChanged() override;

  raw_ptr<Profile> profile_;
  std::vector<scoped_refptr<password_manager::PasswordStoreInterface>> stores_;
  raw_ptr<autofill::PersonalDataManager> personal_data_ = nullptr;

  // Answers scans. Replaced, never edited, when a rebuild finishes.
  std::unique_ptr<redrob::SecretMatcher> matcher_;
  // The rebuild in progress, and how many stores it still waits for.
  std::unique_ptr<redrob::SecretMatcher> building_;
  int pending_stores_ = 0;
  bool ready_ = false;

  base::ScopedMultiSourceObservation<password_manager::PasswordStoreInterface,
                                     password_manager::PasswordStoreInterface::Observer>
      store_observations_{this};
  base::ScopedObservation<autofill::PersonalDataManager,
                          autofill::PersonalDataManagerObserver>
      personal_data_observation_{this};

  // Invalidated on each rebuild, so a store's late answer to an earlier rebuild is ignored.
  base::WeakPtrFactory<RedrobPrivateSavedSecrets> rebuild_weak_factory_{this};
};

}  // namespace extensions

#endif  // CHROME_BROWSER_EXTENSIONS_API_REDROB_PRIVATE_REDROB_PRIVATE_SAVED_SECRETS_H_
