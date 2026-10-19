// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_REDROB_CREDENTIAL_TOOLS_H_
#define CHROME_BROWSER_REDROB_CREDENTIAL_TOOLS_H_

#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "base/functional/callback.h"
#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "base/time/time.h"
#include "base/values.h"
#include "url/origin.h"

class Profile;

namespace actor_login {
class ActorLoginService;
}  // namespace actor_login

namespace content {
class WebContents;
}  // namespace content

namespace device_reauth {
class DeviceAuthenticator;
}  // namespace device_reauth

namespace redrob {

// Signing in on the agent's behalf, over the browser's OWN password store (CAP-9). See docs/CREDENTIALS.md.
//
// THERE IS NO VAULT HERE, deliberately. The profile's password store already encrypts with the OS keystore,
// already knows how to ask the operating system for a re-authentication, and already imports a CSV. A second
// store would be a second place a secret lives, a second encryption scheme to get right, and a second answer
// to "where are my passwords". What this file adds is the AGENT layer: a policy, an unlock window, a per-site
// list, an audit trail, and a tool whose result cannot carry a secret.
//
// HOW THE FILL HAPPENS, and why it is this path. The browser's own agent-login machinery
// (actor_login::ActorLoginService, components/password_manager/core/browser/actor_login) already does the two
// things this needs and nothing more:
//   * GetCredentials() matches the tab's CURRENT committed origin against the store using the same form
//     fetcher autofill uses -- signon realm, public-suffix and affiliation matching included -- and answers
//     Credential records that carry a username and NO password.
//   * AttemptLogin() fills through the frame's PasswordManagerDriver::FillField, i.e. the browser process
//     tells the renderer's password autofill agent to fill, exactly as a user picking a suggestion would.
// So the password goes store -> password manager -> renderer form field. It never enters a std::string this
// file can see, never enters the tool result, and never reaches the engine. The model learns a username (it
// needs one to pick between accounts) and an outcome. Not the password, not its length, not a hint of it.
//
// The URL comes from the tab, never from the model. A model that could name the origin to match could ask
// for a bank's password while the tab shows a phishing page; here the only input is the agent tab, and the
// origin is what that tab has committed.
//
// Quality logs: the login service is handed a logger with no uploader, so its log is collected and dropped.
// Nothing about an agent sign-in leaves the machine.
//
// What it never tries: a one-time code, a passkey, a security key, a CAPTCHA. Those prompts exist to prove a
// person is present, and an agent that answers them defeats the point. The tool reports them and the task
// waits for the user (TaskState::kBlockedOnPolicy), the same way it waits for an unlock.
class CredentialTools {
 public:
  // Stored as an integer in prefs::kAgentCredentialsPolicy. Values are persisted, so never renumber.
  enum class Policy {
    // Fill whenever a task asks, subject only to the per-site list and to the password manager's own
    // "ask before filling" setting, which still applies.
    kAlways = 0,
    // The default. Fill only if the user passed an OS re-authentication within the unlock window.
    kWhileUnlocked = 1,
    // The tool is not offered at all.
    kNever = 2,
  };

  enum class Outcome {
    kFilled,
    kNoSavedLogin,
    kPolicyRefused,
    // The unlock window has lapsed (or the password manager wants a re-authentication the agent cannot
    // give). The task waits for the user.
    kLocked,
    kSeveralLogins,
    kNoSigninForm,
    // The page shows a one-time code, passkey, security key or CAPTCHA prompt.
    kNeedsVerification,
    kFailed,
  };

  // What one login call came to. Usernames only, by construction: there is no field here a password could
  // be put in.
  struct Result {
    Result();
    Result(const Result&);
    Result& operator=(const Result&);
    ~Result();

    Outcome outcome = Outcome::kFailed;
    url::Origin origin;
    // The account that was filled, for kFilled.
    std::string username;
    // Every matching account, for kSeveralLogins. Also filled for kNoSavedLogin when a hint matched none
    // of several, so the model can be told what exists.
    std::vector<std::string> usernames;
    // "otp" or "captcha" for kNeedsVerification.
    std::string verification_kind;
  };
  using ResultCallback = base::OnceCallback<void(Result)>;

  // The tool names, declared to the engine by TaskStore.
  static constexpr char kToolLogin[] = "login";
  static constexpr char kToolAskUserToVerify[] = "ask_user_to_verify";

  explicit CredentialTools(Profile* profile);
  CredentialTools(const CredentialTools&) = delete;
  CredentialTools& operator=(const CredentialTools&) = delete;
  ~CredentialTools();

  Policy policy() const;
  // Whether the tools are declared to the engine at all: never in an off-the-record profile, never when the
  // policy is kNever.
  bool IsOffered() const;
  bool IsOffTheRecord() const;
  // True when the user passed a re-authentication within the unlock window.
  bool IsUnlocked() const;
  base::TimeDelta UnlockWindow() const;

  // The decision taken BEFORE the store is touched, from the policy, the per-site list and the unlock
  // state. kAllowed means "go and look"; it does not promise a login exists.
  enum class Gate { kAllowed, kRefused, kLocked };
  Gate Check(const url::Origin& origin) const;

  // Matches and fills on `contents`' CURRENT committed origin. `username_hint` picks between several
  // accounts and is the only thing the model contributes. The gate is the caller's job (Check above),
  // because a locked result has to park the task rather than answer.
  void Login(content::WebContents* contents,
             const std::string& username_hint,
             ResultCallback callback);

  // Asks the operating system to re-authenticate the user, anchored to `anchor`'s window. On platforms with
  // no device authenticator (Linux) the call itself is the proof of presence: it is reachable only from the
  // component settings and task UI, by a click, never from a tool. Opens the unlock window on success.
  void Unlock(content::WebContents* anchor, base::OnceCallback<void(bool)> callback);
  // Closes the unlock window now.
  void Lock();

  // Appends one audit record (kept to the newest kMaxAuditRecords) to prefs::kAgentCredentialsAudit.
  void RecordUse(const std::string& task_id,
                 const url::Origin& origin,
                 const std::string& username,
                 Outcome outcome);

  // The per-site list. `origin` is serialized url::Origin; anything that does not parse as an http(s)
  // origin is refused.
  bool SetSite(const std::string& origin, bool allow);
  bool RemoveSite(const std::string& origin);

  // What the model is told. A pure function of the result, so the whole surface a secret could leak
  // through is this one switch.
  static std::string ToolResultText(const Result& result);
  // Persisted in the audit record and shown in Settings.
  static const char* OutcomeName(Outcome outcome);
  // The settings page's names for the policy values: "always", "whileUnlocked", "never".
  static const char* PolicyName(Policy policy);
  static std::optional<Policy> ParsePolicy(const std::string& name);

  static constexpr size_t kMaxAuditRecords = 500;

 private:
  // One login call's steps (probe the page, fetch matches, fill). Defined in the .cc so this header does not
  // pull the login service's types -- protobufs included -- into every file that includes TaskStore.
  class LoginFlow;
  friend class LoginFlow;

  void OnAuthenticated(base::OnceCallback<void(bool)> callback, bool success);

  raw_ptr<Profile> profile_;
  std::unique_ptr<actor_login::ActorLoginService> service_;
  // Monotonic, and never persisted: a restart locks the store again, which is the safe surprise.
  base::TimeTicks unlocked_at_;
  // Held only while the OS prompt is up; the authenticator cancels it if destroyed.
  std::unique_ptr<device_reauth::DeviceAuthenticator> authenticator_;

  base::WeakPtrFactory<CredentialTools> weak_factory_{this};
};

}  // namespace redrob

#endif  // CHROME_BROWSER_REDROB_CREDENTIAL_TOOLS_H_
