// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_REDROB_OAUTH_FLOW_H_
#define CHROME_BROWSER_REDROB_OAUTH_FLOW_H_

#include <memory>
#include <string>

#include "base/functional/callback.h"
#include "base/memory/raw_ptr.h"
#include "base/memory/scoped_refptr.h"
#include "base/memory/weak_ptr.h"
#include "base/threading/thread.h"
#include "base/timer/timer.h"
#include "base/time/time.h"
#include "services/network/public/cpp/shared_url_loader_factory.h"
#include "url/gurl.h"

class Profile;

namespace network {
class SimpleURLLoader;
}  // namespace network

namespace redrob {

// OAuth 2.0 authorization code + PKCE, with a loopback redirect, for connecting a model provider the
// user has an account with.
//
// There is no reusable client for this in the tree. `OAuth2AccessTokenFetcherImpl` looks close but its
// request body has no `redirect_uri` and no `code_verifier`, and its parser wants a Google-shaped
// response; `OAuth2ApiCallFlow` is for calling an API once you already hold a token. So the flow is
// written here: verifier, S256 challenge, state, a listener bound to loopback, the code exchange, and
// refresh.
//
// WHAT THIS DOES NOT DO, and why -- because the obvious use is the one that is not allowed:
//
// It ships no client id for anyone else's first-party application. Anthropic banned subscription OAuth
// outside Claude Code in February 2026 and enforces it at the server ("This credential is only
// authorized for use with Claude Code and cannot be used for other API requests"), so a Claude
// subscription cannot be connected here at all -- an API key can, and already works. OpenAI does permit
// ChatGPT subscription OAuth in third-party tools, and its endpoints are public, but a client id that is
// not their first-party one is refused at the token endpoint with 403. So the CLIENT ID is a field the
// user fills in with their own registered client, and the surface says what will happen if they borrow
// somebody else's. Presenting a stolen client id as a feature would work until it did not, and would put
// the user's account rather than ours in front of the consequences.
class OAuthFlow {
 public:
  struct Config {
    GURL authorize_url;
    GURL token_url;
    std::string client_id;
    std::string scopes;
  };

  struct Tokens {
    std::string access_token;
    std::string refresh_token;
    // Absolute, not a duration: this is stored and compared after restarts.
    base::Time expires_at;
  };

  // Empty `error` means success. Exactly one of the two is meaningful.
  using CompleteCallback =
      base::OnceCallback<void(const Tokens& tokens, const std::string& error)>;
  // The URL the browser should open, once the loopback listener is actually listening. Empty `url`
  // means the flow could not start and `error` says why.
  using ReadyCallback =
      base::OnceCallback<void(const GURL& authorize_url, const std::string& error)>;

  OAuthFlow(scoped_refptr<network::SharedURLLoaderFactory> url_loader_factory);
  OAuthFlow(const OAuthFlow&) = delete;
  OAuthFlow& operator=(const OAuthFlow&) = delete;
  ~OAuthFlow();

  // Binds a loopback listener and then hands the authorization URL to `on_ready`. Asynchronous rather
  // than returning the URL, because the bind happens on the IO thread and blocking the UI thread on it
  // -- which is what an earlier draft of this did -- is a stall in the one place a browser must not have
  // one. The caller opens the URL in a tab; this class deliberately does not navigate anything, because
  // "which window" is not a decision a network helper gets to make.
  //
  // `on_complete` fires once: when the redirect arrives and the code is exchanged, when the user
  // refuses, or on timeout.
  void Begin(const Config& config, ReadyCallback on_ready, CompleteCallback on_complete);

  // Exchanges a refresh token for a fresh access token. Used before a turn when the stored one has
  // expired, and separately from Begin because no browser window is involved.
  void Refresh(const Config& config,
               const std::string& refresh_token,
               CompleteCallback on_complete);

  // For tests and for the settings page's copy: the loopback address this flow is listening on.
  const GURL& redirect_url() const { return redirect_url_; }

 private:
  class Listener;

  void OnBound(uint16_t port);
  void OnRedirect(const std::string& state, const std::string& code, const std::string& error);
  void ExchangeCode(const std::string& code);
  void OnTokenResponse(std::optional<std::string> body);
  void Finish(const Tokens& tokens, const std::string& error);

  scoped_refptr<network::SharedURLLoaderFactory> url_loader_factory_;
  std::unique_ptr<base::Thread> io_thread_;
  std::unique_ptr<Listener> listener_;
  std::unique_ptr<network::SimpleURLLoader> loader_;

  Config config_;
  std::string code_verifier_;
  std::string state_;
  GURL redirect_url_;
  GURL authorize_url_;
  ReadyCallback on_ready_;
  CompleteCallback on_complete_;
  base::OneShotTimer timeout_;
  // Kept so a refresh's reply can be told apart from an authorization's; both land in the same parser.
  std::string pending_refresh_token_;

  base::WeakPtrFactory<OAuthFlow> weak_factory_{this};
};

}  // namespace redrob

#endif  // CHROME_BROWSER_REDROB_OAUTH_FLOW_H_
