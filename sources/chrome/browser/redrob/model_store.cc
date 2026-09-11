// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/redrob/model_store.h"

#include <algorithm>
#include <utility>

#include "base/base64.h"
#include "base/functional/bind.h"
#include "base/strings/string_util.h"
#include "base/uuid.h"
#include "chrome/browser/browser_process.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/redrob/redrob_prefs.h"
#include "components/os_crypt/async/browser/os_crypt_async.h"
#include "components/prefs/pref_service.h"
#include "components/prefs/scoped_user_pref_update.h"
#include "url/gurl.h"

namespace redrob {
namespace {

constexpr size_t kMaxProviders = 12;
constexpr size_t kMaxLabelBytes = 100;
constexpr size_t kMaxSecretBytes = 4096;

}  // namespace

ModelStore::ModelStore(Profile* profile) : profile_(profile) {
  // Asked for at construction so the encryptor is usually there by the time a settings page is open.
  // Until it arrives, adding a key is refused -- the alternative is holding a plaintext secret in
  // memory waiting for a keystore, which is exactly the state this class exists to avoid.
  if (g_browser_process && g_browser_process->os_crypt_async()) {
    g_browser_process->os_crypt_async()->GetInstance(
        base::BindOnce(&ModelStore::OnEncryptor, weak_factory_.GetWeakPtr()));
  }
}

ModelStore::~ModelStore() = default;

void ModelStore::OnEncryptor(scoped_refptr<os_crypt_async::Encryptor> encryptor) {
  encryptor_ = std::move(encryptor);
}

std::vector<ModelStore::Provider> ModelStore::List() const {
  std::vector<Provider> providers;
  if (!profile_) {
    return providers;
  }
  for (const base::Value& value : profile_->GetPrefs()->GetList(prefs::kModelProviders)) {
    if (!value.is_dict()) {
      continue;
    }
    const base::DictValue& dict = value.GetDict();
    Provider provider;
    if (const std::string* id = dict.FindString("id")) {
      provider.id = *id;
    }
    if (const std::string* label = dict.FindString("label")) {
      provider.label = *label;
    }
    if (const std::string* model = dict.FindString("model")) {
      provider.model = *model;
    }
    if (const std::string* endpoint = dict.FindString("endpoint")) {
      provider.endpoint = *endpoint;
    }
    const std::string* secret = dict.FindString("secret_b64");
    provider.has_secret = secret && !secret->empty();
    providers.push_back(std::move(provider));
  }
  return providers;
}

std::string ModelStore::selected_id() const {
  return profile_ ? profile_->GetPrefs()->GetString(prefs::kSelectedProviderId) : std::string();
}

bool ModelStore::Select(const std::string& id) {
  if (!profile_) {
    return false;
  }
  // Empty is legal and means the built-in engine, so it is not validated against the list.
  if (!id.empty()) {
    const std::vector<Provider> providers = List();
    const bool known = std::ranges::any_of(
        providers, [&id](const Provider& provider) { return provider.id == id; });
    if (!known) {
      return false;
    }
  }
  profile_->GetPrefs()->SetString(prefs::kSelectedProviderId, id);
  return true;
}

std::string ModelStore::Add(const std::string& label,
                            const std::string& model,
                            const std::string& endpoint,
                            const std::string& secret) {
  if (!profile_ || !encryptor_) {
    return std::string();
  }
  if (label.empty() || label.size() > kMaxLabelBytes || model.empty() ||
      model.size() > kMaxLabelBytes || secret.empty() || secret.size() > kMaxSecretBytes) {
    return std::string();
  }
  // https only, and a real host. A provider endpoint is a place this browser will send the user's page
  // text to; plain http would put that on the wire in the clear.
  const GURL url(endpoint);
  if (!url.is_valid() || !url.SchemeIs("https") || url.host().empty()) {
    return std::string();
  }
  std::vector<Provider> existing = List();
  if (existing.size() >= kMaxProviders) {
    return std::string();
  }

  std::string ciphertext;
  if (!encryptor_->EncryptString(secret, &ciphertext)) {
    return std::string();
  }

  base::DictValue dict;
  const std::string id = base::Uuid::GenerateRandomV4().AsLowercaseString();
  dict.Set("id", id);
  dict.Set("label", label);
  dict.Set("model", model);
  dict.Set("endpoint", url.spec());
  // Base64 because prefs hold text, and the ciphertext is bytes.
  dict.Set("secret_b64", base::Base64Encode(ciphertext));
  ScopedListPrefUpdate update(profile_->GetPrefs(), prefs::kModelProviders);
  update->Append(std::move(dict));
  return id;
}

bool ModelStore::Remove(const std::string& id) {
  if (!profile_ || id.empty()) {
    return false;
  }
  bool removed = false;
  {
    ScopedListPrefUpdate update(profile_->GetPrefs(), prefs::kModelProviders);
    for (auto it = update->begin(); it != update->end(); ++it) {
      if (!it->is_dict()) {
        continue;
      }
      const std::string* existing = it->GetDict().FindString("id");
      if (existing && *existing == id) {
        update->erase(it);
        removed = true;
        break;
      }
    }
  }
  // Removing what was selected falls back to the built-in engine rather than leaving a dangling
  // selection that every later task would have to re-discover is broken.
  if (removed && selected_id() == id) {
    profile_->GetPrefs()->SetString(prefs::kSelectedProviderId, std::string());
  }
  return removed;
}

std::optional<ModelStore::Provider> ModelStore::Selected() const {
  const std::string id = selected_id();
  if (id.empty()) {
    return std::nullopt;
  }
  for (const Provider& provider : List()) {
    if (provider.id == id) {
      if (!provider.has_secret) {
        return std::nullopt;
      }
      return provider;
    }
  }
  return std::nullopt;
}

std::optional<std::string> ModelStore::SecretFor(const std::string& id) const {
  if (!profile_ || !encryptor_ || id.empty()) {
    return std::nullopt;
  }
  for (const base::Value& value : profile_->GetPrefs()->GetList(prefs::kModelProviders)) {
    if (!value.is_dict()) {
      continue;
    }
    const std::string* existing = value.GetDict().FindString("id");
    if (!existing || *existing != id) {
      continue;
    }
    const std::string* encoded = value.GetDict().FindString("secret_b64");
    if (!encoded) {
      return std::nullopt;
    }
    std::string ciphertext;
    if (!base::Base64Decode(*encoded, &ciphertext)) {
      return std::nullopt;
    }
    std::string plaintext;
    if (!encryptor_->DecryptString(ciphertext, &plaintext)) {
      // The keystore has moved under us -- a restored profile, a new OS user. Answering "no key"
      // rather than crashing lets the caller fall back to the built-in engine and say so.
      return std::nullopt;
    }
    return plaintext;
  }
  return std::nullopt;
}

}  // namespace redrob
