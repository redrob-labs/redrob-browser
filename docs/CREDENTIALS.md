# Passwords and agent sign-in

Code: `crates/redrob-shell/src/vault.rs`.

## Where passwords live

- One random 256-bit key in the OS credential store: Keychain on macOS, Credential Manager on
  Windows, Secret Service on Linux. Service `Redrob Browser`, account `vault-key`.
- Each password is sealed with AES-256-GCM under that key, with its own random nonce, in
  `vault.sqlite` in the profile folder. Usernames and sites are stored in the clear so the
  window can list them without unsealing anything.
- If the OS store is unavailable the vault does not open. There is no plaintext fallback.

## What the agent can and cannot see

1. **It can see:** the site the tab is showing, the saved usernames for it, and an outcome
   (filled, no saved login, several logins, no sign-in form, locked, blocked, refused).
2. **It cannot see:** a password, its length, or any hint of it. The secret goes vault, then the
   window, then the page's field as a CDP call argument. It is never part of a script's text,
   never logged, and never returned through CDP or MCP.
3. **Which site:** the tab's committed origin (`scheme://host:port`). The model never names a
   site to match, so a lookalike page cannot borrow another site's login. A login is unsealed
   only for the origin it was saved for.

## Policy

| Setting | Meaning |
|---|---|
| While unlocked (default) | The agent fills only within 15 minutes (adjustable) of the person unlocking the vault |
| Always | The agent fills on every site that is not blocked |
| Never | The agent never fills; the sign-in tool is not offered |

- Per site: **block** refuses under every policy; **allow** skips the unlock for that site.
- Unlock: an OS re-authentication on macOS and Windows; on Linux, which has no device
  authenticator, the person's own click in the window.
- Codes, passkeys, security keys and CAPTCHAs: the agent does not try. It asks the person to take
  over the tab.

## Audit

Every fill, by the person or the agent, is recorded with time, site, username, who and the
outcome. The last 500 are kept, and the agent's history is shown in the window. Nothing is
uploaded.

## Importing from Chrome

Chrome encrypts `Login Data` with a key it keeps in the OS store: "Chrome Safe Storage" in the
macOS Keychain, the Secret Service or the fixed `peanuts` key on Linux (`v10`/`v11`), DPAPI on
Windows. Windows Chrome 127 and later use app-bound encryption (`v20`), which another program
cannot open; there the import asks the person to export a CSV from Chrome's password settings.
