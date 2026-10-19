# Agent sign-in: the credential boundary

The agent signs in with logins saved in the profile's own password manager. There is no second vault.

1. **What the model can see:** the site the agent tab is showing, the saved usernames for it, and an outcome (filled, no saved login, refused, locked, several logins, no sign-in form, needs verification, failed).
2. **What it cannot see:** a password, its length, or any hint of it. The browser's agent-login service fills the form through the password manager driver; the secret goes store → password manager → form field and never enters the tool result or the engine.
3. **Which site:** the agent tab's committed origin. The model never names a URL to match, so a phishing page cannot borrow a bank's login.
4. **Default policy: while unlocked.** The agent fills only within 15 minutes (adjustable) of an OS re-authentication (Touch ID, Windows Hello; on Linux, which has no device authenticator, the user's own click in Settings). Other options: always, never. The password manager's own "ask before filling" setting still applies.
5. **Per site:** block refuses a site under every policy; allow skips the unlock for it. Never overrides both.
6. **Locked, or a code / passkey / security key / CAPTCHA:** the agent does not try. The task waits in `kBlockedOnPolicy` until the user unlocks or says they finished, from Settings → Passwords and the agent.
7. **Never:** in a private (off-the-record) profile, in a read-only task, or when the policy is never; the tool is not even offered.
8. **Audit:** every sign-in attempt is a `kUsedCredential` step in the task trace and a record (time, site, username, task, outcome) in the AI sign-in history, the last 500 kept. No quality log is uploaded.
9. **App bridge:** the engine's app-bridge `login` tool (`browser-bridge.ts`) calls the CDP command `Browser.redrobLogin`, which runs `TaskStore::LoginFromBridge` in the browser process: same gate, same fill path, audit records under task `app-bridge`. A locked store answers "ask the user to unlock" instead of parking, because there is no task to park.
10. **Not built:** passkeys, TOTP, cards, notes, SSH keys and API credentials as agent-usable types.
11. **Code:** `sources/chrome/browser/redrob/credential_tools.{h,cc}`, the `login` / `ask_user_to_verify` dispatch in `task_store.cc`, prefs `redrob.agent_credentials.*`, the settings page `agent/apps/app/screens/agent-passwords/`.
