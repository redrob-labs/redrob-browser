// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_REDROB_MODEL_STORE_H_
#define CHROME_BROWSER_REDROB_MODEL_STORE_H_

#include <optional>
#include <string>
#include <vector>

#include "base/memory/raw_ptr.h"
#include "base/memory/scoped_refptr.h"
#include "base/memory/weak_ptr.h"
#include "components/keyed_service/core/keyed_service.h"
#include "components/os_crypt/async/common/encryptor.h"

class Profile;

namespace redrob {

// Which model answers tasks, and the credential that reaches it.
//
// The built-in Redrob engine needs nothing here: it runs on loopback and the browser generates its own
// credential per launch. This class exists for the other case -- a user with their own account at an
// OpenAI-compatible provider -- and the whole design question is where that key lives.
//
// It lives encrypted, through the platform's own keystore (Keychain, DPAPI, Secret Service), and it
// NEVER crosses to a renderer. A settings page can add a key, replace a key and see that a key is set;
// it cannot read one back. That asymmetry is deliberate: the page that shows the field is the least
// trustworthy part of the browser, and a key it can read is a key any compromise of it can take.
class ModelStore : public KeyedService {
 public:
  struct Provider {
    std::string id;
    // What the user calls it in the picker.
    std::string label;
    // The model id sent to the endpoint, e.g. `gpt-5.1` or `claude-opus-5`.
    std::string model;
    // Must be https. An OpenAI-compatible base URL; the browser appends the completions path.
    std::string endpoint;
    // Whether a key is on file. Never the key itself.
    bool has_secret = false;
  };

  explicit ModelStore(Profile* profile);
  ModelStore(const ModelStore&) = delete;
  ModelStore& operator=(const ModelStore&) = delete;
  ~ModelStore() override;

  std::vector<Provider> List() const;
  // Empty means the built-in engine, which is the default and the fallback whenever a selected
  // provider has gone missing.
  std::string selected_id() const;
  bool Select(const std::string& id);

  // `secret` is consumed and encrypted; it is not stored, logged or echoed. Returns the new id.
  std::string Add(const std::string& label,
                  const std::string& model,
                  const std::string& endpoint,
                  const std::string& secret);
  bool Remove(const std::string& id);

  // The selected provider, resolved for use by the turn builder. Nullopt means "use the built-in
  // engine" -- either because nothing is selected or because what was selected no longer decrypts,
  // which is the honest answer when a keystore has moved under us.
  std::optional<Provider> Selected() const;
  // The plaintext key for `id`, for the browser process only, and only at the moment a request is
  // built. Nullopt when there is none or when the platform keystore is unavailable.
  std::optional<std::string> SecretFor(const std::string& id) const;

  // True once the platform encryptor has arrived. Adding a key before that is refused rather than
  // stored in the clear.
  bool encryption_ready() const { return encryptor_ != nullptr; }

 private:
  void OnEncryptor(scoped_refptr<os_crypt_async::Encryptor> encryptor);

  raw_ptr<Profile> profile_;
  scoped_refptr<os_crypt_async::Encryptor> encryptor_;
  base::WeakPtrFactory<ModelStore> weak_factory_{this};
};

}  // namespace redrob

#endif  // CHROME_BROWSER_REDROB_MODEL_STORE_H_
