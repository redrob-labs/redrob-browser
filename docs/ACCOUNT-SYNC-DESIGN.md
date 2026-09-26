# Redrob account and sync -- design

Written after Google sign-in was ruled out (see `docs/GOOGLE-SURFACES.md` and
`docs/GOOGLE-CREDENTIALS.md`): Chrome Sync is Chrome-only, and Google closed
browser-level sign-in to Chromium derivatives in 2021. Cross-device bookmarks
cannot be bought with an API key. If we want them, we build them.

This document is grounded in a read of the actual repositories, not in memory of
them. Every claim below names the file it came from.

## 1. What already exists -- the audit

### redrob-auth is the identity provider, and it is first-class

`redrob-auth` is a standalone OAuth 2.0 / OIDC provider (Next.js + Prisma, its
own migrations, its own session and device-session management, an admin client
registration API).

- `src/app/api/.well-known/openid-configuration/route.ts` --
  `grant_types_supported: ['authorization_code', 'refresh_token']`.
  **There is no device_code grant.**
- `src/app/oauth/token/route.ts:88` -- public clients are supported:
  "allow no client_secret for public clients using PKCE".
  Line 161 requires and verifies `code_verifier` when the authorization used
  `code_challenge`; line 174 rejects the no-PKCE-no-secret case.
- `src/app/api/admin/clients/route.ts:65` -- clients default to
  `['authorization_code', 'refresh_token']`.
- Console's own comment (`apps/api/src/auth/redrob-auth.service.ts:24-38`)
  records that redrob-auth signs per client and **defaults to HS256 with a
  service-wide secret**, and that its JWKS is deliberately an empty key set
  until an RSA key is configured. So a relying party cannot verify the
  `id_token` locally; it calls `/oauth/userinfo` with the freshly-exchanged
  access token instead.

**Consequence for the browser.** A shipped desktop browser is a *public*
client: it cannot hold a client secret, because a secret in a shipped binary is
a published secret. That is the same lesson the Google API key work just taught
us. redrob-auth already supports exactly the right thing -- authorization code
+ PKCE with no secret -- so the browser needs no new grant type and no secret.
It does need a loopback redirect (RFC 8252), which is the standard native-app
answer and is something the browser is uniquely good at hosting.

### Console is the workspace, the wallet and the gateway -- not a per-user store

`redrob-console/apps/api/src` modules: `auth`, `device`, `members`, `invites`,
`keys`, `billing`, `usage`, `logs`, `inference`, `rate-limit`, `health`.

Its 14 tables (`apps/api/src/db/schema.ts`): `accounts`, `users`, `identities`,
`blocked_email_domains`, `memberships`, `invites`, `api_keys`,
`rate_limit_increase_requests`, `refresh_tokens`, `request_logs`,
`credit_transactions`, `device_authorizations`, `rate_limits`, `route_pins`.

**There is no table for tasks, routines, memory, bookmarks or history.** Layer-1
sync is therefore roughly half a Console-side project: a new module, new tables,
a migration, and openapi contract regeneration -- not a client-only change.

Console signs people in *through* redrob-auth
(`auth/redrob-auth.service.ts:12`, provider string `redrob-auth`). Console is a
relying party, not the identity authority. So "our account" is redrob-auth's
account, and Console is one consumer of it.

### Console's device flow issues a WORKSPACE API KEY -- the wrong grain for sync

`apps/api/src/device/device.controller.ts` implements RFC 8628, and its own
header comment says what it hands out: "What it issues is an ordinary workspace
API key, the same credential the key list shows and can revoke."

That credential is right for what it was built for -- an app that needs to call
the inference gateway and bill a workspace. It is wrong for personal sync:

- It identifies a **workspace**, not a person. Two members of one workspace
  would sync their bookmarks into the same bucket.
- It is the **billing and inference** credential. Coupling "my bookmarks sync"
  to the key that spends credits means revoking one revokes the other.

`apps/api/src/device/device-products.ts` also settles a naming question for us:
the id `browser` is **already taken by the extension**, with a comment stating
that the browser must take an id of its own when it builds the client half.

### The browser stores agent state in profile prefs -- and one thing not at all

`sources/chrome/browser/redrob/redrob_prefs.h` / `.cc`:

| What | Pref | Notes |
|---|---|---|
| Routines | `redrob.routines` | list of dicts |
| Memory | `redrob.memory.entries` (+ enabled, retention) | 90-day default retention |
| Model providers | `redrob.model.providers` | secrets OSCrypt-encrypted, base64'd |
| Working folder | `redrob.working_folder` | absolute local path |
| Password choice, import done, RPC | | |

Two findings here are load-bearing.

**a. Our own header already decided these must NOT sync, in writing.**
`redrob_prefs.h` says: "None of these are syncable. Agent state describes one
machine's browsing and one machine's folders, and a routine that opens tabs
would be a surprising thing to have arrive from another device."

Onboarding promises the opposite -- that tasks, memory and routines follow the
account rather than the device. **One of the two has to change**, and that is a
product decision, not a plumbing one. The header's reasoning is not weak:

- A routine is an *action* schedule. Syncing it means a routine authored on a
  laptop fires on a desktop, possibly twice, possibly while nobody is watching.
- `redrob.working_folder` is an absolute local path and is meaningless on
  another machine.
- Memory entries are derived from **browsing content**. They are the most
  sensitive thing in the list, and uploading them is a privacy decision a user
  must make explicitly, not a default.

**b. Tasks are not persisted at all.** `task_store.h:196` holds them in
`std::map<std::string, mojom::TaskPtr> tasks_`, with conversations and
working folders in sibling maps. Tasks do not survive a browser restart on the
*same* machine. "Tasks follow your account" is therefore doubly false today, and
**local durability is a prerequisite for syncing them** -- you cannot sync what
you do not store.

### The browser has no account client yet

The only account-shaped code in the fork is the sidebar row
(`ui/views/tabs/vertical/redrob_account_row.h/.cc`), which is a view that opens
settings. There is no HTTP client for Console or redrob-auth, no token store,
no device registration. Today that row's space is taken at startup by
upstream's "Sign in to Google?" promo -- a surface we cannot honour.

## 2. The two candidate architectures

The question put to this design is whether the browser talks to Console
directly, or reaches it through the engine.

### Option A -- browser is its own client of redrob-auth (direct)

The browser registers as a public OAuth client of redrob-auth, does
authorization code + PKCE with a loopback redirect, stores the refresh token in
OSCrypt, and calls a new Console sync API with its own access token.

**For.**
- A browser must be a browser with no engine installed. Bookmarks, history and
  tabs are browser concerns; the engine has no business seeing them.
  Today `FindEngineBinary` reports "not installed" on a clean machine, and under
  Option B that machine also has no account and no sync.
- The credential grain is right: a per-user, per-device token, revocable on its
  own, separate from the workspace key that spends credits.
- No secret ships. PKCE public client is already supported
  (`oauth/token/route.ts:88`).
- Failure isolation: an engine crash or a too-old engine (we shipped the
  capability handshake for exactly that) does not take sync down.

**Against.**
- It breaks single sign-on as literally stated: the user may sign in to the
  engine *and* to the browser. That must be designed away, not ignored -- see
  §4.
- The browser must implement a token lifecycle it does not have today: refresh,
  rotation (redrob-auth rotates refresh tokens, `oauth/token/route.ts:323`),
  revocation, and a signed-out state.
- Because redrob-auth defaults to HS256 with no JWKS, the browser cannot verify
  an `id_token` locally; it must call `/oauth/userinfo` over TLS, like Console
  does. Acceptable, but it is a network round trip on a UI path.

### Option B -- browser reaches Console through the engine (single login)

The browser asks the local engine, over the loopback RPC we already
authenticated, to perform account calls on its behalf. The engine already holds
Console credentials; `redrob providers login` already exists.

**For.**
- One login, which was the stated point of the built-in path.
- No new credential store in the browser.

**Against, and this is what decides it.**
- **The engine holds the wrong credential.** What the engine has is a workspace
  API key from the device flow (`device.controller.ts`), which identifies a
  workspace and pays for inference. Personal bookmark sync behind that key is a
  category error, and it cannot separate two members of one workspace.
- **Sync would depend on the engine being installed, current and running.** We
  have measured all three failure modes this week: not installed, too old to
  serve the contract (v0.4.1 has neither the route nor the capability entry),
  and serving-but-unable (`400 model not available`). Each would become "your
  bookmarks stopped syncing".
- **It puts browsing data through the agent process.** Bookmarks and history
  would cross a process whose job is to run model-driven tools. That widens the
  blast radius of the thing we just hardened the loopback credential for.
- It makes the engine a proxy for an API it has no interest in, which is new
  engine surface to maintain for a browser feature.

### Recommendation

**Option A, with single sign-on solved at the identity layer rather than by
proxying.** Both products are clients of the same IdP. The correct way to make
one login serve both is a shared redrob-auth session, not one product borrowing
the other's credential. Concretely: when the engine has already signed in on
this machine, the browser's authorization request lands on an existing
redrob-auth session and completes without a second password prompt. The user
sees one consent, once -- which is what "single login" actually means to them --
while each product keeps a credential of its own grain and its own revocation.

## 3. Scope, in two layers

### Layer 1 -- our own data (tasks, routines, memory)

This is what onboarding already promises, and the schema is ours, so there is no
foreign data model to absorb. It is still not small, because of §1:

1. **Persist tasks locally first.** They are in-memory today. Without this,
   layer 1 cannot include tasks at all.
2. **Decide the routine question** (§1a). A routine is an action, not a
   document. Proposal: sync the routine *definition*, but bind execution to one
   nominated device, so a schedule does not silently fire on every machine.
3. **Memory is opt-in, not default.** It is derived from browsing content.
   Default off, with an explicit switch and a plain statement of what leaves the
   machine.
4. **Working folder never syncs.** It is an absolute local path.
5. New Console module + tables + migration + contract regeneration.

### Layer 2 -- Chrome data (bookmarks, passwords, history, tabs)

This is what the user asked about, and it is materially heavier:

- Passwords require end-to-end encryption with a key the server never holds.
  Anything less is worse than not shipping it.
- Bookmarks need real conflict resolution (move vs delete vs rename on two
  devices), which is the part that makes sync a project rather than an endpoint.
- Chromium's own sync data model would have to be either adopted or deliberately
  rejected in favour of ours.

**Layer 2 must not start before layer 1 works end to end.** Attempting both
finishes neither.

Note for expectation-setting: **import is not sync, and import already exists**
(`chromium_profile_locator.cc` plus the onboarding import step). Edge behaves
the same way -- it imports from Chrome, and syncs through a Microsoft account.
A user who wants their Chrome bookmarks *here* is served by import today; sync
is about keeping two Redrob installs in step.

## 4. Open decisions -- these need the product owner, not more reading

1. **Onboarding's promise vs `redrob_prefs.h`'s decision.** They contradict each
   other today. Either the copy is corrected now, or the header's reasoning is
   overruled with a stated answer for scheduled routines and for uploading
   memory derived from browsing.
2. **Device id for the browser in `DEVICE_PRODUCTS`** -- `browser` is taken by
   the extension. A new id is needed *if* we ever use the device flow here; under
   Option A for sync we do not, but we may still want it for engine-less
   inference.
3. **Does the browser get its own redrob-auth client registration, HS256 or
   RS256?** RS256 + a real JWKS would let both Console and the browser verify
   tokens locally instead of calling userinfo. That is an IdP-side improvement
   worth doing once rather than working around twice.
4. **Layer-1 sync scope**: tasks + routines + memory, or start with tasks alone
   once they are durable?

## 5. What has NOT been verified

- redrob-auth's token lifetimes and rotation behaviour were read from
  `oauth/token/route.ts`, not exercised against a running instance.
- No Console sync endpoints were prototyped; the claim that they do not exist is
  from the table list and module list, which is strong, but a running instance
  was not queried.
- Nothing in this document has been built or run. It is a design read off the
  repositories.
