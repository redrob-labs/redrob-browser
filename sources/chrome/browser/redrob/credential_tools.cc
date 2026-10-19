// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/redrob/credential_tools.h"

#include <utility>

#include "base/functional/bind.h"
#include "base/functional/callback_helpers.h"
#include "base/memory/scoped_refptr.h"
#include "base/strings/string_util.h"
#include "base/strings/utf_string_conversions.h"
#include "build/build_config.h"
#include "chrome/browser/password_manager/actor_login/actor_login_permission_cleaning_service_factory.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/redrob/redrob_prefs.h"
#include "chrome/browser/redrob/resources/grit/redrob_strings.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "components/device_reauth/device_authenticator.h"
#include "components/password_manager/content/browser/content_password_manager_driver.h"
#include "components/password_manager/content/browser/content_password_manager_driver_factory.h"
#include "components/password_manager/core/browser/actor_login/actor_login_quality_logger.h"
#include "components/password_manager/core/browser/actor_login/actor_login_service_impl.h"
#include "components/password_manager/core/browser/actor_login/actor_login_types.h"
#include "components/password_manager/core/browser/actor_login/internal/actor_login_delegate_client.h"
#include "components/password_manager/core/browser/actor_login/internal/actor_login_web_content_interface.h"
#include "components/prefs/pref_service.h"
#include "components/prefs/scoped_user_pref_update.h"
#include "components/tabs/public/tab_interface.h"
#include "content/public/browser/page.h"
#include "content/public/browser/render_frame_host.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_contents_observer.h"
#include "content/public/browser/web_contents_user_data.h"
#include "ui/base/l10n/l10n_util.h"
#include "url/gurl.h"

#if BUILDFLAG(IS_MAC) || BUILDFLAG(IS_WIN) || BUILDFLAG(IS_CHROMEOS)
#include "chrome/browser/device_reauth/chrome_device_authenticator_factory.h"
#endif

namespace redrob {
namespace {

// Our isolated world for the verification probe. Distinct from PageTools' world so the two never share
// state; any non-zero id is isolated from the page's own script.
constexpr int32_t kCredentialProbeWorldId = 0x52444232;  // "RDB2"

// Bounds on what the settings page may store. A renderer sends these.
constexpr int kMinUnlockMinutes = 1;
constexpr int kMaxUnlockMinutes = 24 * 60;
constexpr size_t kMaxSites = 500;

// Looks for the prompts the agent must never answer. DOM signals only, read in an isolated world: an
// input the site itself marked as a one-time code, or the frame of a common CAPTCHA. A passkey or security
// key request is browser UI rather than DOM, so it is reported by the agent through ask_user_to_verify
// instead of detected here.
constexpr char kVerificationProbe[] = R"((() => {
  const q = (s) => document.querySelector(s);
  if (q('input[autocomplete="one-time-code"]')) return 'otp';
  if (q('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="challenges.cloudflare.com"], ' +
        '.g-recaptcha, .h-captcha, .cf-turnstile')) return 'captcha';
  return '';
})())";

std::string Join(const std::vector<std::string>& names) {
  std::string out;
  for (const std::string& name : names) {
    if (!out.empty()) {
      out += ", ";
    }
    out += name.empty() ? std::string("(no username)") : name;
  }
  return out;
}

bool IsWebOrigin(const url::Origin& origin) {
  return !origin.opaque() && (origin.scheme() == "https" || origin.scheme() == "http");
}

// The agent tab's side of the login service: which frame, which client, which prefs.
//
// Our own implementation rather than the browser's agent client, because that one is bound to a different
// agent framework's task and focus model (its focus check and its control-release observer both CHECK that
// framework's task exists). Ours answers the same questions about the agent tab: is it the tab in front of
// the user, and which driver fills it. Federated sign-in is not offered: the tool only ever passes password
// credentials, so the two federated hooks answer null and are never reached.
class RedrobLoginClient : public actor_login::ActorLoginDelegateClient,
                          public content::WebContentsObserver,
                          public content::WebContentsUserData<RedrobLoginClient> {
 public:
  ~RedrobLoginClient() override = default;

  // The client the login service reads, but only when the page can be filled at all. The delegate CHECKs
  // a driver and a password client exist, so asking without both would be a crash, not a refusal.
  static RedrobLoginClient* ForFilling(content::WebContents* contents) {
    if (!contents || !contents->GetPrimaryMainFrame()) {
      return nullptr;
    }
    RedrobLoginClient* client = GetOrCreateForWebContents(contents);
    if (!client->GetPasswordManagerClient() || !client->GetPasswordManagerDriverForMainFrame()) {
      return nullptr;
    }
    return client;
  }

  // actor_login::ActorLoginDelegateClient:
  void SetActorLoginWebContentInterface(
      actor_login::ActorLoginWebContentInterface* web_interface) override {
    web_interface_ = web_interface;
  }
  PrefService* GetPrefs() override {
    return Profile::FromBrowserContext(GetWebContents().GetBrowserContext())->GetPrefs();
  }
  password_manager::PasswordManagerClient* GetPasswordManagerClient() override {
    auto* factory =
        password_manager::ContentPasswordManagerDriverFactory::FromWebContents(&GetWebContents());
    return factory ? factory->password_client() : nullptr;
  }
  password_manager::PasswordManagerDriver* GetPasswordManagerDriverForMainFrame() override {
    content::RenderFrameHost* frame = GetWebContents().GetPrimaryMainFrame();
    return frame ? password_manager::ContentPasswordManagerDriver::GetForRenderFrameHost(frame)
                 : nullptr;
  }
  ukm::SourceId GetPageUkmSourceIdForMainFrame() override {
    return GetWebContents().GetPrimaryMainFrame()->GetPageUkmSourceId();
  }
  url::Origin GetLastCommittedOriginForMainFrame() override {
    // THE origin. Never a model argument: this is what the tab has committed.
    return GetWebContents().GetPrimaryMainFrame()->GetLastCommittedOrigin();
  }
  translate::TranslateManager* GetTranslateManager() override {
    // Only used to tag a quality log with the page language, and that log is dropped.
    return nullptr;
  }
  actor_login::ActorLoginPermissionCleaningService* GetPermissionCleaningService() override {
    return actor_login::ActorLoginPermissionCleaningServiceFactory::GetForProfile(
        Profile::FromBrowserContext(GetWebContents().GetBrowserContext()));
  }
  std::unique_ptr<actor_login::ActorLoginCredentialsFetcher> CreateFederatedCredentialsFetcher(
      scoped_refptr<actor_login::ActorLoginQualityLoggerInterface> mqls_logger,
      actor_login::ActorLoginMetricsHelper* metrics_helper) override {
    return nullptr;
  }
  std::unique_ptr<actor_login::ActorLoginSiwgControllerInterface> CreateSiwgController(
      const actor_login::Credential& credential,
      bool should_store_permission,
      actor_login::LoginStatusResultOrErrorReply on_finished_callback,
      base::WeakPtr<actor_login::ActionSequenceDelegate> action_sequence_delegate,
      scoped_refptr<actor_login::ActorLoginQualityLoggerInterface> mqls_logger,
      base::TimeTicks attempt_login_tool_start_time,
      base::OnceCallback<void(bool)> post_button_click_login_result_callback) override {
    return nullptr;
  }
  bool IsTaskInFocus() override {
    // In front of the user: the agent tab is the active tab of the active window. The password manager
    // only asks this when it wants a re-authentication before filling, and an OS prompt over a window the
    // user is not looking at is a prompt they did not ask for.
    tabs::TabInterface* tab = tabs::TabInterface::MaybeGetFromContents(&GetWebContents());
    if (!tab || !tab->IsActivated()) {
      return false;
    }
    BrowserWindowInterface* window = tab->GetBrowserWindowInterface();
    return window && window->IsActive();
  }
  bool SupportsFedCmEmbedderInitiatedLogin() override { return false; }
  void RemoveFederatedEmbedderLoginRequest() override {}
  void ObserveControlStateForCurrentTask(base::OnceClosure on_released_callback) override {}
  base::WeakPtr<actor_login::ActorLoginDelegateClient> AsWeakPtr() override {
    return weak_factory_.GetWeakPtr();
  }

  // content::WebContentsObserver:
  void PrimaryPageChanged(content::Page& page) override {
    // A fill in flight against a page that has gone is interrupted by the delegate, not completed into
    // the next one.
    if (web_interface_) {
      web_interface_->OnPrimaryPageChanged();
    }
  }
  void WebContentsDestroyed() override {
    if (web_interface_) {
      web_interface_->OnContextDestroyed();
    }
    web_interface_ = nullptr;
  }

 private:
  friend class content::WebContentsUserData<RedrobLoginClient>;

  explicit RedrobLoginClient(content::WebContents* contents)
      : content::WebContentsObserver(contents),
        content::WebContentsUserData<RedrobLoginClient>(*contents) {}

  raw_ptr<actor_login::ActorLoginWebContentInterface> web_interface_ = nullptr;
  base::WeakPtrFactory<RedrobLoginClient> weak_factory_{this};

  WEB_CONTENTS_USER_DATA_KEY_DECL();
};

WEB_CONTENTS_USER_DATA_KEY_IMPL(RedrobLoginClient);

CredentialTools::Outcome FromLoginStatus(actor_login::LoginStatusResult status) {
  using actor_login::LoginStatusResult;
  switch (status) {
    case LoginStatusResult::kSuccessUsernameFilled:
    case LoginStatusResult::kSuccessPasswordFilled:
    case LoginStatusResult::kSuccessUsernameAndPasswordFilled:
      return CredentialTools::Outcome::kFilled;
    case LoginStatusResult::kErrorNoSigninForm:
    case LoginStatusResult::kErrorNoFillableFields:
      return CredentialTools::Outcome::kNoSigninForm;
    case LoginStatusResult::kErrorInvalidCredential:
      return CredentialTools::Outcome::kNoSavedLogin;
    // The password manager's own "re-authenticate before filling" applies to the agent too. When it
    // cannot ask (the agent tab is not in front) or the user declined, the user has to step in.
    case LoginStatusResult::kErrorDeviceReauthRequired:
    case LoginStatusResult::kErrorDeviceReauthFailed:
      return CredentialTools::Outcome::kLocked;
    default:
      return CredentialTools::Outcome::kFailed;
  }
}

}  // namespace

// Carries one login call across its three asynchronous steps. Owned by the callback chain; holds the
// CredentialTools weakly because the profile can go away mid-call.
class CredentialTools::LoginFlow {
 public:
  LoginFlow(base::WeakPtr<CredentialTools> tools,
            base::WeakPtr<content::WebContents> contents,
            std::string username_hint,
            ResultCallback callback)
      : tools_(std::move(tools)),
        contents_(std::move(contents)),
        username_hint_(std::move(username_hint)),
        callback_(std::move(callback)),
        // No uploader: the log is collected and dropped. Nothing about an agent sign-in leaves the machine.
        logger_(base::MakeRefCounted<ActorLoginQualityLogger>(nullptr, nullptr)) {}

  static void Start(std::unique_ptr<LoginFlow> flow) {
    content::WebContents* contents = flow->contents_.get();
    if (!contents || !contents->GetPrimaryMainFrame()) {
      flow->Finish(Outcome::kFailed);
      return;
    }
    flow->result_.origin = contents->GetPrimaryMainFrame()->GetLastCommittedOrigin();
    if (!IsWebOrigin(flow->result_.origin)) {
      flow->Finish(Outcome::kNoSigninForm);
      return;
    }
    content::RenderFrameHost* frame = contents->GetPrimaryMainFrame();
    frame->ExecuteJavaScriptInIsolatedWorld(
        base::UTF8ToUTF16(std::string(kVerificationProbe)),
        base::BindOnce(&LoginFlow::OnProbed, std::move(flow)), kCredentialProbeWorldId);
  }

 private:
  static void OnProbed(std::unique_ptr<LoginFlow> flow, base::Value probe) {
    if (probe.is_string() && !probe.GetString().empty()) {
      flow->result_.verification_kind = probe.GetString();
      flow->Finish(Outcome::kNeedsVerification);
      return;
    }
    RedrobLoginClient* client = RedrobLoginClient::ForFilling(flow->contents_.get());
    if (!client || !flow->tools_ || !Same(flow.get(), client)) {
      flow->Finish(client ? Outcome::kFailed : Outcome::kNoSigninForm);
      return;
    }
    actor_login::ActorLoginService* service = flow->tools_->service_.get();
    scoped_refptr<actor_login::ActorLoginQualityLoggerInterface> logger = flow->logger_;
    service->GetCredentials(client, /*has_sign_in_with_google_button=*/false, logger,
                            base::BindOnce(&LoginFlow::OnCredentials, std::move(flow)));
  }

  static void OnCredentials(std::unique_ptr<LoginFlow> flow,
                            actor_login::CredentialsOrError credentials) {
    if (!credentials.has_value()) {
      flow->Finish(credentials.error() == actor_login::ActorLoginError::kFillingNotAllowed
                       ? Outcome::kPolicyRefused
                       : Outcome::kFailed);
      return;
    }
    // Passwords only. A federated credential would be a different flow with its own consent surface.
    std::vector<actor_login::Credential> passwords;
    bool form_on_page = false;
    for (actor_login::Credential& credential : credentials.value()) {
      if (credential.type != actor_login::CredentialType::kPassword) {
        continue;
      }
      form_on_page |= credential.immediatelyAvailableToLogin;
      passwords.push_back(std::move(credential));
    }
    if (passwords.empty()) {
      flow->Finish(Outcome::kNoSavedLogin);
      return;
    }
    std::vector<std::string> names;
    for (const actor_login::Credential& credential : passwords) {
      names.push_back(base::UTF16ToUTF8(credential.username));
    }
    if (!form_on_page) {
      flow->result_.usernames = names;
      flow->Finish(Outcome::kNoSigninForm);
      return;
    }

    // Pick the account. The hint is matched exactly (case-insensitively), never fuzzily: a near match that
    // fills the wrong account signs the agent in as someone the user did not name.
    const actor_login::Credential* chosen = nullptr;
    if (!flow->username_hint_.empty()) {
      for (const actor_login::Credential& credential : passwords) {
        if (base::EqualsCaseInsensitiveASCII(base::UTF16ToUTF8(credential.username),
                                             flow->username_hint_)) {
          chosen = &credential;
          break;
        }
      }
    } else if (passwords.size() == 1) {
      chosen = &passwords.front();
    }
    if (!chosen) {
      flow->result_.usernames = names;
      flow->Finish(Outcome::kSeveralLogins);
      return;
    }

    // The page may have moved while the store answered; the delegate CHECKs a live driver.
    RedrobLoginClient* client = RedrobLoginClient::ForFilling(flow->contents_.get());
    if (!client || !flow->tools_ || !Same(flow.get(), client)) {
      flow->Finish(Outcome::kFailed);
      return;
    }
    flow->result_.username = base::UTF16ToUTF8(chosen->username);
    const actor_login::Credential credential = *chosen;
    actor_login::ActorLoginService* service = flow->tools_->service_.get();
    scoped_refptr<actor_login::ActorLoginQualityLoggerInterface> logger = flow->logger_;
    service->AttemptLogin(client, credential,
                          // Never store a standing "the agent may use this" grant: our own policy and
                          // per-site list are the grant, and the user can read and change them.
                          /*should_store_permission=*/false, logger, base::TimeTicks::Now(),
                          base::DoNothing(),
                          base::BindOnce(&LoginFlow::OnAttempted, std::move(flow)),
                          /*action_sequence_delegate=*/
                          base::WeakPtr<actor_login::ActionSequenceDelegate>());
  }

  static void OnAttempted(std::unique_ptr<LoginFlow> flow,
                          actor_login::LoginStatusResultOrError status) {
    if (!status.has_value()) {
      flow->Finish(status.error() == actor_login::ActorLoginError::kFillingNotAllowed
                       ? Outcome::kPolicyRefused
                       : Outcome::kFailed);
      return;
    }
    const Outcome outcome = FromLoginStatus(status.value());
    if (outcome != Outcome::kFilled) {
      flow->result_.username.clear();
    }
    flow->Finish(outcome);
  }

  // The origin we matched is the origin we fill. A navigation between the two steps would otherwise fill
  // a different site with a password matched for the first.
  static bool Same(LoginFlow* flow, RedrobLoginClient* client) {
    return client->GetLastCommittedOriginForMainFrame() == flow->result_.origin;
  }

  void Finish(Outcome outcome) {
    result_.outcome = outcome;
    std::move(callback_).Run(result_);
  }

  base::WeakPtr<CredentialTools> tools_;
  base::WeakPtr<content::WebContents> contents_;
  std::string username_hint_;
  ResultCallback callback_;
  scoped_refptr<actor_login::ActorLoginQualityLoggerInterface> logger_;
  Result result_;
};

CredentialTools::Result::Result() = default;
CredentialTools::Result::Result(const Result&) = default;
CredentialTools::Result& CredentialTools::Result::operator=(const Result&) = default;
CredentialTools::Result::~Result() = default;

CredentialTools::CredentialTools(Profile* profile)
    : profile_(profile), service_(std::make_unique<actor_login::ActorLoginServiceImpl>()) {}

CredentialTools::~CredentialTools() = default;

CredentialTools::Policy CredentialTools::policy() const {
  if (!profile_) {
    return Policy::kNever;
  }
  switch (profile_->GetPrefs()->GetInteger(prefs::kAgentCredentialsPolicy)) {
    case 0:
      return Policy::kAlways;
    case 2:
      return Policy::kNever;
    default:
      // Anything unrecognised reads as the default rather than as the widest setting.
      return Policy::kWhileUnlocked;
  }
}

bool CredentialTools::IsOffTheRecord() const {
  return !profile_ || profile_->IsOffTheRecord();
}

bool CredentialTools::IsOffered() const {
  return !IsOffTheRecord() && policy() != Policy::kNever;
}

base::TimeDelta CredentialTools::UnlockWindow() const {
  int minutes = profile_ ? profile_->GetPrefs()->GetInteger(prefs::kAgentCredentialsUnlockMinutes)
                         : kMinUnlockMinutes;
  if (minutes < kMinUnlockMinutes || minutes > kMaxUnlockMinutes) {
    minutes = 15;
  }
  return base::Minutes(minutes);
}

bool CredentialTools::IsUnlocked() const {
  return !unlocked_at_.is_null() && base::TimeTicks::Now() - unlocked_at_ < UnlockWindow();
}

CredentialTools::Gate CredentialTools::Check(const url::Origin& origin) const {
  if (!IsOffered() || !IsWebOrigin(origin)) {
    return Gate::kRefused;
  }
  const base::DictValue& sites = profile_->GetPrefs()->GetDict(prefs::kAgentCredentialsSites);
  const std::string* site = sites.FindString(origin.Serialize());
  if (site && *site == "deny") {
    return Gate::kRefused;
  }
  if (policy() == Policy::kAlways || (site && *site == "allow")) {
    return Gate::kAllowed;
  }
  return IsUnlocked() ? Gate::kAllowed : Gate::kLocked;
}

void CredentialTools::Login(content::WebContents* contents,
                            const std::string& username_hint,
                            ResultCallback callback) {
  if (!contents) {
    Result result;
    result.outcome = Outcome::kFailed;
    std::move(callback).Run(result);
    return;
  }
  LoginFlow::Start(std::make_unique<LoginFlow>(weak_factory_.GetWeakPtr(), contents->GetWeakPtr(),
                                               username_hint, std::move(callback)));
}

void CredentialTools::Unlock(content::WebContents* anchor,
                             base::OnceCallback<void(bool)> callback) {
  if (IsOffTheRecord()) {
    std::move(callback).Run(false);
    return;
  }
#if BUILDFLAG(IS_MAC) || BUILDFLAG(IS_WIN) || BUILDFLAG(IS_CHROMEOS)
  if (anchor && !authenticator_) {
    // Zero validity: every unlock is a fresh prompt, never the password manager's cached one.
    device_reauth::DeviceAuthParams params(base::Seconds(0),
                                           device_reauth::DeviceAuthSource::kPasswordManager);
    authenticator_ = ChromeDeviceAuthenticatorFactory::GetForProfile(
        profile_, anchor->GetTopLevelNativeWindow(), params);
    if (authenticator_ && authenticator_->CanAuthenticateWithBiometricOrScreenLock()) {
      authenticator_->AuthenticateWithMessage(
          l10n_util::GetStringUTF16(IDS_REDROB_AGENT_CREDENTIALS_UNLOCK_PROMPT),
          base::BindOnce(&CredentialTools::OnAuthenticated, weak_factory_.GetWeakPtr(),
                         std::move(callback)));
      return;
    }
    authenticator_.reset();
  }
#endif
  // No device authenticator on this platform (Linux), or none configured on this machine. The call is
  // reachable only from the component settings and task UI by a click -- never from a tool -- so the click
  // is the proof that a person is present, and it opens the window the same way.
  OnAuthenticated(std::move(callback), true);
}

void CredentialTools::OnAuthenticated(base::OnceCallback<void(bool)> callback, bool success) {
  authenticator_.reset();
  if (success) {
    unlocked_at_ = base::TimeTicks::Now();
  }
  std::move(callback).Run(success);
}

void CredentialTools::Lock() {
  unlocked_at_ = base::TimeTicks();
}

void CredentialTools::RecordUse(const std::string& task_id,
                                const url::Origin& origin,
                                const std::string& username,
                                Outcome outcome) {
  if (!profile_ || IsOffTheRecord()) {
    return;
  }
  base::DictValue record;
  record.Set("time_ms", static_cast<double>(base::Time::Now().InMillisecondsSinceUnixEpoch()));
  record.Set("origin", origin.opaque() ? std::string() : origin.Serialize());
  record.Set("username", username);
  record.Set("task_id", task_id);
  record.Set("outcome", OutcomeName(outcome));
  ScopedListPrefUpdate update(profile_->GetPrefs(), prefs::kAgentCredentialsAudit);
  update->Append(std::move(record));
  while (update->size() > kMaxAuditRecords) {
    update->erase(update->begin());
  }
}

bool CredentialTools::SetSite(const std::string& origin_string, bool allow) {
  if (!profile_ || IsOffTheRecord()) {
    return false;
  }
  const url::Origin origin = url::Origin::Create(GURL(origin_string));
  if (!IsWebOrigin(origin)) {
    return false;
  }
  ScopedDictPrefUpdate update(profile_->GetPrefs(), prefs::kAgentCredentialsSites);
  if (!update->Find(origin.Serialize()) && update->size() >= kMaxSites) {
    return false;
  }
  update->Set(origin.Serialize(), allow ? "allow" : "deny");
  return true;
}

bool CredentialTools::RemoveSite(const std::string& origin_string) {
  if (!profile_) {
    return false;
  }
  ScopedDictPrefUpdate update(profile_->GetPrefs(), prefs::kAgentCredentialsSites);
  // Removed by the key the page was given, which is the serialized origin; a re-serialization would miss a
  // key stored before a normalization change.
  if (update->Remove(origin_string)) {
    return true;
  }
  return update->Remove(url::Origin::Create(GURL(origin_string)).Serialize());
}

// static
std::string CredentialTools::ToolResultText(const Result& result) {
  // EVERY string the model can receive from a sign-in is built here, from usernames and an origin. Nothing
  // below can carry a password, a password's length, or a hint of one, because Result has no such field.
  const std::string site = result.origin.opaque() ? std::string("this page") : result.origin.Serialize();
  switch (result.outcome) {
    case Outcome::kFilled:
      return "The browser filled the saved login for " +
             (result.username.empty() ? std::string("this site") : result.username) + " on " + site +
             ". The password was filled by the browser's password manager and is not shown to you. "
             "Continue with the site's own sign-in button. If the site then asks for a one-time code, a "
             "passkey, a security key or a CAPTCHA, do not attempt it: call ask_user_to_verify.";
    case Outcome::kNoSavedLogin:
      return "There is no saved login for " + site +
             " in the browser's password manager. Ask the user to sign in themselves, or to save a login "
             "for this site first.";
    case Outcome::kPolicyRefused:
      return "The user's settings do not let the agent sign in to " + site +
             ". Do not try another way of signing in; ask the user to sign in themselves.";
    case Outcome::kLocked:
      return "Signing in needs the user to unlock the browser's passwords first. The task is waiting for "
             "them.";
    case Outcome::kSeveralLogins:
      return "Several saved logins match " + site + ": " + Join(result.usernames) +
             ". Ask the user which one to use, then call login again with that username as "
             "username_hint.";
    case Outcome::kNoSigninForm:
      return "There is no sign-in form on " + site +
             " that the browser can fill. Open the site's sign-in page first, then call login again.";
    case Outcome::kNeedsVerification:
      return "The page is asking for " +
             std::string(result.verification_kind == "captcha" ? "a CAPTCHA" : "a one-time code") +
             ". The agent does not answer these; the task is waiting for the user to complete it.";
    case Outcome::kFailed:
      return "The browser could not sign in on this page. Do not retry; tell the user.";
  }
}

// static
const char* CredentialTools::OutcomeName(Outcome outcome) {
  switch (outcome) {
    case Outcome::kFilled:
      return "filled";
    case Outcome::kNoSavedLogin:
      return "noSavedLogin";
    case Outcome::kPolicyRefused:
      return "refused";
    case Outcome::kLocked:
      return "locked";
    case Outcome::kSeveralLogins:
      return "severalLogins";
    case Outcome::kNoSigninForm:
      return "noSigninForm";
    case Outcome::kNeedsVerification:
      return "needsVerification";
    case Outcome::kFailed:
      return "failed";
  }
}

// static
const char* CredentialTools::PolicyName(Policy policy) {
  switch (policy) {
    case Policy::kAlways:
      return "always";
    case Policy::kWhileUnlocked:
      return "whileUnlocked";
    case Policy::kNever:
      return "never";
  }
}

// static
std::optional<CredentialTools::Policy> CredentialTools::ParsePolicy(const std::string& name) {
  if (name == "always") {
    return Policy::kAlways;
  }
  if (name == "whileUnlocked") {
    return Policy::kWhileUnlocked;
  }
  if (name == "never") {
    return Policy::kNever;
  }
  return std::nullopt;
}

}  // namespace redrob
