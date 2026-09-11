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
#include "chrome/browser/redrob/oauth_flow.h"
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

ModelStore::ModelStore(Profile* profile,
                       scoped_refptr<network::SharedURLLoaderFactory> url_loader_factory)
    : profile_(profile), url_loader_factory_(std::move(url_loader_factory)) {
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
    const std::string* refresh = dict.FindString("refresh_b64");
    provider.is_oauth = refresh && !refresh->empty();
    provider.has_secret = (secret && !secret->empty()) || provider.is_oauth;
    if (const std::string* authorize = dict.FindString("authorize_url")) {
      provider.oauth.authorize_url = GURL(*authorize);
    }
    if (const std::string* token_url = dict.FindString("token_url")) {
      provider.oauth.token_url = GURL(*token_url);
    }
    if (const std::string* client_id = dict.FindString("client_id")) {
      provider.oauth.client_id = *client_id;
    }
    if (const std::string* scopes = dict.FindString("scopes")) {
      provider.oauth.scopes = *scopes;
    }
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

std::string ModelStore::Seal(const std::string& plaintext) const {
  std::string ciphertext;
  if (!encryptor_ || plaintext.empty() || !encryptor_->EncryptString(plaintext, &ciphertext)) {
    return std::string();
  }
  return base::Base64Encode(ciphertext);
}

std::optional<std::string> ModelStore::Unseal(const std::string& encoded) const {
  if (!encryptor_ || encoded.empty()) {
    return std::nullopt;
  }
  std::string ciphertext;
  if (!base::Base64Decode(encoded, &ciphertext)) {
    return std::nullopt;
  }
  std::string plaintext;
  if (!encryptor_->DecryptString(ciphertext, &plaintext)) {
    // The keystore moved under us -- a restored profile, a different OS user. "No credential" is the
    // honest answer, and it lets the caller fall back rather than crash.
    return std::nullopt;
  }
  return plaintext;
}

void ModelStore::BeginOAuth(const std::string& label,
                            const std::string& model,
                            const std::string& endpoint,
                            const OAuthFlow::Config& config,
                            OAuthFlow::ReadyCallback on_authorize_url) {
  if (!profile_ || !encryptor_) {
    std::move(on_authorize_url).Run(GURL(), "This machine's keystore has not answered yet.");
    return;
  }
  const GURL base(endpoint);
  if (label.empty() || model.empty() || !base.is_valid() || !base.SchemeIsHTTPOrHTTPS()) {
    std::move(on_authorize_url).Run(GURL(), "A name, a model and a valid endpoint are all required.");
    return;
  }
  if (List().size() >= kMaxProviders) {
    std::move(on_authorize_url).Run(GURL(), "There are already too many providers.");
    return;
  }
  // Replaces any flow still open. A second sign-in is the user having given up on the first.
  flow_ = std::make_unique<OAuthFlow>(url_loader_factory_);
  flow_->Begin(config, std::move(on_authorize_url),
               base::BindOnce(&ModelStore::OnOAuthComplete, weak_factory_.GetWeakPtr(), label,
                              model, base.spec(), config));
}

void ModelStore::OnOAuthComplete(const std::string& label,
                                 const std::string& model,
                                 const std::string& endpoint,
                                 const OAuthFlow::Config& config,
                                 const OAuthFlow::Tokens& tokens,
                                 const std::string& error) {
  if (!profile_ || !error.empty() || tokens.access_token.empty()) {
    return;
  }
  const std::string sealed_access = Seal(tokens.access_token);
  if (sealed_access.empty()) {
    return;
  }
  base::DictValue dict;
  const std::string id = base::Uuid::GenerateRandomV4().AsLowercaseString();
  dict.Set("id", id);
  dict.Set("label", label);
  dict.Set("model", model);
  dict.Set("endpoint", endpoint);
  dict.Set("authorize_url", config.authorize_url.spec());
  dict.Set("token_url", config.token_url.spec());
  dict.Set("client_id", config.client_id);
  dict.Set("scopes", config.scopes);
  dict.Set("access_b64", sealed_access);
  // A provider with no refresh token is one that will stop working when the access token expires. Stored
  // anyway, because it works until then and saying so is the surface's job -- but the empty field is
  // what `is_oauth` is read from, so a refresh-less connection is recorded honestly as a key-like one.
  dict.Set("refresh_b64", Seal(tokens.refresh_token));
  dict.Set("expires_ms", static_cast<double>(tokens.expires_at.InMillisecondsSinceUnixEpoch()));
  ScopedListPrefUpdate update(profile_->GetPrefs(), prefs::kModelProviders);
  update->Append(std::move(dict));
}

bool ModelStore::WriteTokens(const std::string& id, const OAuthFlow::Tokens& tokens) {
  if (!profile_) {
    return false;
  }
  const std::string sealed_access = Seal(tokens.access_token);
  if (sealed_access.empty()) {
    return false;
  }
  ScopedListPrefUpdate update(profile_->GetPrefs(), prefs::kModelProviders);
  for (base::Value& value : *update) {
    if (!value.is_dict()) {
      continue;
    }
    const std::string* existing = value.GetDict().FindString("id");
    if (!existing || *existing != id) {
      continue;
    }
    value.GetDict().Set("access_b64", sealed_access);
    if (!tokens.refresh_token.empty()) {
      value.GetDict().Set("refresh_b64", Seal(tokens.refresh_token));
    }
    value.GetDict().Set("expires_ms",
                        static_cast<double>(tokens.expires_at.InMillisecondsSinceUnixEpoch()));
    return true;
  }
  return false;
}

void ModelStore::EnsureToken(const std::string& id, TokenCallback callback) {
  if (!profile_ || id.empty()) {
    std::move(callback).Run(std::nullopt);
    return;
  }
  // An API-key provider: the key IS the bearer token and never expires.
  if (std::optional<std::string> key = SecretFor(id); key.has_value()) {
    std::move(callback).Run(std::move(key));
    return;
  }

  for (const base::Value& value : profile_->GetPrefs()->GetList(prefs::kModelProviders)) {
    if (!value.is_dict()) {
      continue;
    }
    const base::DictValue& dict = value.GetDict();
    const std::string* existing = dict.FindString("id");
    if (!existing || *existing != id) {
      continue;
    }
    const base::Time expires_at = base::Time::FromMillisecondsSinceUnixEpoch(
        dict.FindDouble("expires_ms").value_or(0));
    const std::string* access = dict.FindString("access_b64");
    if (access && base::Time::Now() < expires_at) {
      std::move(callback).Run(Unseal(*access));
      return;
    }
    // Expired, or about to be. Refresh before the turn rather than letting it fail and be retried.
    const std::string* refresh = dict.FindString("refresh_b64");
    std::optional<std::string> refresh_token = refresh ? Unseal(*refresh) : std::nullopt;
    if (!refresh_token.has_value() || refresh_token->empty()) {
      // No way to renew. The stored access token is handed over if it is still there, because a token
      // that MIGHT work beats refusing to try, and the provider's own error is more informative than
      // ours would be.
      std::move(callback).Run(access ? Unseal(*access) : std::nullopt);
      return;
    }
    OAuthFlow::Config config;
    if (const std::string* token_url = dict.FindString("token_url")) {
      config.token_url = GURL(*token_url);
    }
    if (const std::string* client_id = dict.FindString("client_id")) {
      config.client_id = *client_id;
    }
    flow_ = std::make_unique<OAuthFlow>(url_loader_factory_);
    flow_->Refresh(config, refresh_token.value(),
                   base::BindOnce(&ModelStore::OnRefreshed, weak_factory_.GetWeakPtr(), id,
                                  std::move(callback)));
    return;
  }
  std::move(callback).Run(std::nullopt);
}

void ModelStore::OnRefreshed(const std::string& id,
                             TokenCallback callback,
                             const OAuthFlow::Tokens& tokens,
                             const std::string& error) {
  if (!error.empty() || tokens.access_token.empty()) {
    std::move(callback).Run(std::nullopt);
    return;
  }
  WriteTokens(id, tokens);
  std::move(callback).Run(tokens.access_token);
}

}  // namespace redrob
