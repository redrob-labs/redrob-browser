// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/redrob/oauth_flow.h"

#include <utility>

#include "base/base64url.h"
#include "base/functional/bind.h"
#include "base/json/json_reader.h"
#include "base/rand_util.h"
#include "base/strings/escape.h"
#include "base/strings/string_split.h"
#include "base/strings/stringprintf.h"
#include "base/task/bind_post_task.h"
#include "base/task/sequenced_task_runner.h"
#include "base/values.h"
#include "crypto/hash.h"
#include "net/base/net_errors.h"
#include "net/base/url_util.h"
#include "net/server/http_server.h"
#include "net/server/http_server_request_info.h"
#include "net/socket/tcp_server_socket.h"
#include "net/traffic_annotation/network_traffic_annotation.h"
#include "services/network/public/cpp/resource_request.h"
#include "services/network/public/cpp/simple_url_loader.h"

namespace redrob {
namespace {

// A token response is small. Anything larger is not one, and reading it would be reading whatever is at
// the other end rather than a provider.
constexpr size_t kMaxTokenResponseBytes = 64 * 1024;
// Long enough to sign in, including a password manager and a second factor; short enough that a
// forgotten flow does not hold a loopback port for the session.
constexpr base::TimeDelta kFlowTimeout = base::Minutes(10);

constexpr net::NetworkTrafficAnnotationTag kAnnotation =
    net::DefineNetworkTrafficAnnotation("redrob_oauth_token", R"(
      semantics {
        sender: "Redrob model provider sign-in"
        description:
          "Exchanges an OAuth authorization code, or a refresh token, for an access token at the token "
          "endpoint of the model provider the user is connecting in Redrob settings."
        trigger:
          "The user connects a model provider by signing in, or a stored access token has expired and a "
          "task needs a fresh one."
        data:
          "The authorization code or refresh token, the PKCE code verifier, the client id the user "
          "entered, and the loopback redirect address. No browsing data and no page contents."
        destination: OTHER
        destination_other: "The token endpoint the user entered in Redrob settings."
      }
      policy {
        cookies_allowed: NO
        setting: "Only happens when the user connects a provider in Redrob settings."
        policy_exception_justification: "No policy yet; the fork's enterprise story is not built."
      })");

// base64url without padding, which is what RFC 7636 wants for both halves of PKCE.
std::string RandomUrlSafe(size_t bytes) {
  std::vector<uint8_t> buffer(bytes);
  base::RandBytes(buffer);
  std::string encoded;
  base::Base64UrlEncode(std::string(buffer.begin(), buffer.end()),
                        base::Base64UrlEncodePolicy::OMIT_PADDING, &encoded);
  return encoded;
}

std::string S256Challenge(const std::string& verifier) {
  const auto digest = crypto::hash::Sha256(base::as_byte_span(verifier));
  std::string encoded;
  base::Base64UrlEncode(std::string(digest.begin(), digest.end()),
                        base::Base64UrlEncodePolicy::OMIT_PADDING, &encoded);
  return encoded;
}

std::string FormEncode(const std::vector<std::pair<std::string, std::string>>& fields) {
  std::string out;
  for (const auto& [key, value] : fields) {
    if (!out.empty()) {
      out += "&";
    }
    out += base::EscapeUrlEncodedData(key, true) + "=" +
           base::EscapeUrlEncodedData(value, true);
  }
  return out;
}

// The query of `path`, as a map. Written here rather than reached for because the callback arrives on a
// raw HTTP server, not through GURL's navigation path.
std::map<std::string, std::string> QueryOf(const std::string& path) {
  std::map<std::string, std::string> out;
  const size_t question = path.find('?');
  if (question == std::string::npos) {
    return out;
  }
  for (const std::string& pair : base::SplitString(path.substr(question + 1), "&",
                                                   base::TRIM_WHITESPACE,
                                                   base::SPLIT_WANT_NONEMPTY)) {
    const size_t equals = pair.find('=');
    if (equals == std::string::npos) {
      continue;
    }
    out[pair.substr(0, equals)] =
        base::UnescapeBinaryURLComponent(pair.substr(equals + 1));
  }
  return out;
}

// An endpoint this flow is willing to talk to. https, or http on loopback: a token endpoint on
// 127.0.0.1 cannot be intercepted on a network, and self-hosted gateways genuinely live there. Anything
// else would be a credential exchange in the clear.
bool IsAllowedEndpoint(const GURL& url) {
  if (!url.is_valid()) {
    return false;
  }
  if (url.SchemeIs("https")) {
    return true;
  }
  return url.SchemeIs("http") && net::IsLocalhost(url);
}

}  // namespace

// The loopback listener. Lives on its own IO thread for the same reason the RPC server's does:
// net::HttpServer's accept loop requires an IO message pump.
class OAuthFlow::Listener : public net::HttpServer::Delegate {
 public:
  using RedirectCallback = base::RepeatingCallback<
      void(const std::string& state, const std::string& code, const std::string& error)>;

  explicit Listener(RedirectCallback on_redirect) : on_redirect_(std::move(on_redirect)) {}
  ~Listener() override = default;

  // Returns the port, or 0.
  uint16_t Bind() {
    auto socket = std::make_unique<net::TCPServerSocket>(nullptr, net::NetLogSource());
    // Loopback, port 0. A redirect URI pointing anywhere else would be a redirect URI an authorization
    // server could send somebody else's code to.
    if (socket->ListenWithAddressAndPort("127.0.0.1", 0, 1) != net::OK) {
      return 0;
    }
    server_ = std::make_unique<net::HttpServer>(std::move(socket), this);
    net::IPEndPoint address;
    if (server_->GetLocalAddress(&address) != net::OK) {
      return 0;
    }
    return address.port();
  }

  void OnConnect(int connection_id) override {}
  void OnWebSocketRequest(int connection_id, const net::HttpServerRequestInfo&) override {
    server_->Send404(connection_id, kAnnotation);
  }
  void OnWebSocketMessage(int connection_id, std::string) override {}
  void OnClose(int connection_id) override {}

  void OnHttpRequest(int connection_id, const net::HttpServerRequestInfo& info) override {
    const std::map<std::string, std::string> query = QueryOf(info.path);
    const auto code = query.find("code");
    const auto state = query.find("state");
    const auto error = query.find("error");

    // A page for the human, since this is a tab they are looking at. Deliberately static text with no
    // script and nothing from the query in it -- the values here came from a redirect and a page that
    // echoed them back would be echoing whatever an authorization server was told to send.
    const std::string body =
        error != query.end()
            ? "<!doctype html><meta charset=utf-8><title>Not connected</title>"
              "<body style=\"font:15px system-ui;padding:3rem\">"
              "<h1>Not connected</h1><p>You can close this tab and try again in Settings.</p>"
            : "<!doctype html><meta charset=utf-8><title>Connected</title>"
              "<body style=\"font:15px system-ui;padding:3rem\">"
              "<h1>Connected</h1><p>You can close this tab.</p>";
    server_->Send(connection_id, net::HTTP_OK, body, "text/html", kAnnotation);

    on_redirect_.Run(state != query.end() ? state->second : std::string(),
                     code != query.end() ? code->second : std::string(),
                     error != query.end() ? error->second : std::string());
  }

 private:
  RedirectCallback on_redirect_;
  std::unique_ptr<net::HttpServer> server_;
};

OAuthFlow::OAuthFlow(scoped_refptr<network::SharedURLLoaderFactory> url_loader_factory)
    : url_loader_factory_(std::move(url_loader_factory)) {}

OAuthFlow::~OAuthFlow() {
  if (io_thread_) {
    io_thread_->task_runner()->DeleteSoon(FROM_HERE, std::move(listener_));
    io_thread_->Stop();
  }
}

void OAuthFlow::Begin(const Config& config,
                      ReadyCallback on_ready,
                      CompleteCallback on_complete) {
  config_ = config;
  on_ready_ = std::move(on_ready);
  on_complete_ = std::move(on_complete);
  pending_refresh_token_.clear();

  if (!IsAllowedEndpoint(config_.authorize_url) || !IsAllowedEndpoint(config_.token_url) ||
      config_.client_id.empty()) {
    if (on_ready_) {
      std::move(on_ready_).Run(
          GURL(), "That provider needs an https authorize URL, an https token URL and a client id.");
    }
    Finish({}, "That provider needs an https authorize URL, an https token URL and a client id.");
    return;
  }

  // 32 bytes, which base64url'd is 43 characters -- the minimum RFC 7636 allows and the length every
  // implementation agrees on.
  code_verifier_ = RandomUrlSafe(32);
  state_ = RandomUrlSafe(16);

  io_thread_ = std::make_unique<base::Thread>("RedrobOAuth");
  base::Thread::Options options(base::MessagePumpType::IO, 0);
  if (!io_thread_->StartWithOptions(std::move(options))) {
    io_thread_.reset();
    if (on_ready_) {
      std::move(on_ready_).Run(GURL(),
                               "A local listener for the sign-in redirect could not be started.");
    }
    Finish({}, "A local listener for the sign-in redirect could not be started.");
    return;
  }
  listener_ = std::make_unique<Listener>(base::BindPostTask(
      base::SequencedTaskRunner::GetCurrentDefault(),
      base::BindRepeating(&OAuthFlow::OnRedirect, weak_factory_.GetWeakPtr())));

  // The bind happens on the IO thread and the answer comes back here. The authorization URL cannot be
  // handed out before the port it names is listening, or the user's click races the socket.
  io_thread_->task_runner()->PostTaskAndReplyWithResult(
      FROM_HERE,
      base::BindOnce([](Listener* listener) { return listener->Bind(); },
                     base::Unretained(listener_.get())),
      base::BindOnce(&OAuthFlow::OnBound, weak_factory_.GetWeakPtr()));
}

void OAuthFlow::OnBound(uint16_t port) {
  if (port == 0) {
    if (on_ready_) {
      std::move(on_ready_).Run(GURL(), "A local port for the sign-in redirect could not be bound.");
    }
    Finish({}, "A local port for the sign-in redirect could not be bound.");
    return;
  }
  redirect_url_ = GURL(base::StringPrintf("http://127.0.0.1:%u/oauth-callback", port));

  const std::string query = FormEncode({
      {"response_type", "code"},
      {"client_id", config_.client_id},
      {"redirect_uri", redirect_url_.spec()},
      {"state", state_},
      {"code_challenge", S256Challenge(code_verifier_)},
      {"code_challenge_method", "S256"},
      {"scope", config_.scopes},
  });
  GURL::Replacements replacements;
  replacements.SetQueryStr(query);
  authorize_url_ = config_.authorize_url.ReplaceComponents(replacements);

  // The flow does not wait forever. A user who closed the tab should not leave a port held open and a
  // callback that never fires.
  timeout_.Start(FROM_HERE, kFlowTimeout,
                 base::BindOnce(&OAuthFlow::Finish, weak_factory_.GetWeakPtr(), Tokens(),
                                "The sign-in was not completed."));

  if (on_ready_) {
    std::move(on_ready_).Run(authorize_url_, std::string());
  }
}

void OAuthFlow::OnRedirect(const std::string& state,
                           const std::string& code,
                           const std::string& error) {
  if (!on_complete_) {
    return;
  }
  if (!error.empty()) {
    Finish({}, "The provider refused the sign-in: " + error);
    return;
  }
  // Compared before anything is done with the code. A redirect whose state is not the one we generated
  // is not the end of the flow we started, and treating it as one is what CSRF against an OAuth client
  // looks like.
  if (state != state_ || code.empty()) {
    Finish({}, "That redirect did not match this sign-in.");
    return;
  }
  ExchangeCode(code);
}

void OAuthFlow::ExchangeCode(const std::string& code) {
  auto request = std::make_unique<network::ResourceRequest>();
  request->url = config_.token_url;
  request->method = "POST";
  // No cookies to a token endpoint. The code and the verifier are the credential; anything the jar
  // would add is an unrelated secret sent along for no reason.
  request->credentials_mode = network::mojom::CredentialsMode::kOmit;

  const std::string body = FormEncode({
      {"grant_type", "authorization_code"},
      {"code", code},
      {"redirect_uri", redirect_url_.spec()},
      {"client_id", config_.client_id},
      // The proof. Without this the code alone would be enough for anyone who intercepted it, which is
      // the entire reason PKCE exists for a client that cannot hold a secret.
      {"code_verifier", code_verifier_},
  });
  loader_ = network::SimpleURLLoader::Create(std::move(request), kAnnotation);
  loader_->AttachStringForUpload(body, "application/x-www-form-urlencoded");
  loader_->DownloadToString(
      url_loader_factory_.get(),
      base::BindOnce(&OAuthFlow::OnTokenResponse, weak_factory_.GetWeakPtr()),
      kMaxTokenResponseBytes);
}

void OAuthFlow::Refresh(const Config& config,
                        const std::string& refresh_token,
                        CompleteCallback on_complete) {
  config_ = config;
  on_complete_ = std::move(on_complete);
  pending_refresh_token_ = refresh_token;
  if (!IsAllowedEndpoint(config_.token_url) || refresh_token.empty()) {
    Finish({}, "There is nothing to refresh with.");
    return;
  }

  auto request = std::make_unique<network::ResourceRequest>();
  request->url = config_.token_url;
  request->method = "POST";
  request->credentials_mode = network::mojom::CredentialsMode::kOmit;
  const std::string body = FormEncode({
      {"grant_type", "refresh_token"},
      {"refresh_token", refresh_token},
      {"client_id", config_.client_id},
  });
  loader_ = network::SimpleURLLoader::Create(std::move(request), kAnnotation);
  loader_->AttachStringForUpload(body, "application/x-www-form-urlencoded");
  loader_->DownloadToString(
      url_loader_factory_.get(),
      base::BindOnce(&OAuthFlow::OnTokenResponse, weak_factory_.GetWeakPtr()),
      kMaxTokenResponseBytes);
}

void OAuthFlow::OnTokenResponse(std::optional<std::string> body) {
  loader_.reset();
  if (!body.has_value()) {
    Finish({}, "The token endpoint could not be reached.");
    return;
  }
  std::optional<base::DictValue> parsed =
      base::JSONReader::ReadDict(body.value(), base::JSON_PARSE_RFC);
  if (!parsed) {
    Finish({}, "The token endpoint did not answer with JSON.");
    return;
  }
  if (const std::string* error = parsed->FindString("error")) {
    const std::string* description = parsed->FindString("error_description");
    // Passed through rather than summarised. `invalid_client` from a borrowed client id, or a 403 for a
    // region, are things the user can only act on if they can read them.
    Finish({}, "The provider refused it: " + *error +
                   (description ? " (" + *description + ")" : std::string()));
    return;
  }
  const std::string* access = parsed->FindString("access_token");
  if (!access || access->empty()) {
    Finish({}, "The token endpoint returned no access token.");
    return;
  }

  Tokens tokens;
  tokens.access_token = *access;
  const std::string* refresh = parsed->FindString("refresh_token");
  // A refresh response often omits the refresh token, meaning "keep the one you have". Dropping it
  // there would turn a working connection into one that expires for good in an hour.
  tokens.refresh_token = refresh && !refresh->empty() ? *refresh : pending_refresh_token_;
  const std::optional<int> expires_in = parsed->FindInt("expires_in");
  // A minute of slack, so a token that expires while a request is in flight is refreshed before the
  // request rather than after it fails.
  tokens.expires_at = base::Time::Now() +
                      base::Seconds(expires_in.value_or(3600)) - base::Minutes(1);
  Finish(tokens, std::string());
}

void OAuthFlow::Finish(const Tokens& tokens, const std::string& error) {
  timeout_.Stop();
  if (io_thread_) {
    io_thread_->task_runner()->DeleteSoon(FROM_HERE, std::move(listener_));
    io_thread_->StopSoon();
  }
  if (on_complete_) {
    std::move(on_complete_).Run(tokens, error);
  }
}

}  // namespace redrob
