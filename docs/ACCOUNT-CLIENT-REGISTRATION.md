# Registering the browser as a redrob-auth client

Follow-up to `docs/ACCOUNT-SYNC-DESIGN.md`, which chose Option A: the browser is
its own **public** OAuth client of redrob-auth (authorization code + PKCE, no
shipped secret). This document is the registration request, the constraints it
must satisfy, and the browser-side work it implies.

Every claim names the file in `redrob-auth` it was read from. Nothing here has
been executed against a running instance -- registration needs an admin session
we do not hold.

## 1. The registration request

| Field | Value |
|---|---|
| `name` | `Redrob Browser` |
| `redirectUris` | `http://127.0.0.1:47813/oauth2/callback`, `http://127.0.0.1:47814/oauth2/callback`, `http://127.0.0.1:47815/oauth2/callback` |
| `postLogoutRedirectUris` | `http://127.0.0.1:47813/oauth2/signed-out` (plus 47814, 47815) |
| `scopes` | `openid`, `profile`, `email` |
| `allowedGrantTypes` | `authorization_code`, `refresh_token` |
| Client authentication | **none** -- PKCE S256, secret never leaves the server |

Admin call (`src/app/api/admin/clients/route.ts`, POST, admin session cookie
required -- `isUserAdmin` gate on line 40):

```bash
curl -X POST https://auth.redrob.io/api/admin/clients \
  -H 'Content-Type: application/json' \
  -b "$ADMIN_SESSION_COOKIE" \
  -d '{
    "name": "Redrob Browser",
    "redirectUris": [
      "http://127.0.0.1:47813/oauth2/callback",
      "http://127.0.0.1:47814/oauth2/callback",
      "http://127.0.0.1:47815/oauth2/callback"
    ],
    "postLogoutRedirectUris": [
      "http://127.0.0.1:47813/oauth2/signed-out",
      "http://127.0.0.1:47814/oauth2/signed-out",
      "http://127.0.0.1:47815/oauth2/signed-out"
    ],
    "scopes": ["openid", "profile", "email"],
    "allowedGrantTypes": ["authorization_code", "refresh_token"]
  }'
```

The response body contains `client.secret`. **It must be discarded, not
delivered to this repository.** See §3.

## 2. Why these exact values

### Three fixed loopback ports, not one, and not a dynamic one

`validateClient` matches the redirect URI with
`client.redirectUris.includes(redirectUri)` (`src/lib/db/store.ts:419`), and the
token endpoint re-checks `authCode.redirectUri !== redirectUri`
(`oauth/token/route.ts:152`). Both are **exact string** comparisons.

RFC 8252 tells a native app to bind an ephemeral loopback port and expects the
server to ignore the port when matching. redrob-auth does not do that, so an
ephemeral port can never match a registered URI. The options were:

- One fixed port -- fails outright when anything else holds it.
- A private scheme (`redrob://`) -- `new URL()` accepts it, so registration
  would pass, but it needs OS-level scheme registration per platform and cannot
  be tested from a plain build.
- **Three fixed ports, tried in order** -- chosen. Collision on all three is
  vanishingly unlikely, and every candidate is registered ahead of time so the
  match stays exact. The ports are in the IANA dynamic range and were picked to
  avoid this project's own ranges (`3100-3300` is the KiroCrew gateway).

If redrob-auth later normalises loopback matching per RFC 8252, this collapses
to one registered URI and a dynamic port. That is the better end state; it is
an IdP change, so it is not a prerequisite here.

### `openid profile email`, no `phone`

Console asks for `phone` as well; the browser does not need a phone number to
sync tasks. Note what it does **not** buy us: `ClientFeatures.
requirePhoneVerification` defaults to **`true`**
(`prisma/schema.prisma:256`), so a user signing up *through the browser* is
asked for a phone OTP regardless of the scopes we request. That is a product
decision to make before launch, not a code change here -- it is one field on the
features row.

### No `device_code`

`/.well-known/openid-configuration` advertises only
`authorization_code` and `refresh_token`. There is no device grant in this IdP;
Console's device flow is Console's own RFC 8628 implementation and issues a
*workspace API key*, which §1 of the design doc rejected for personal sync.

## 3. The public-client gap, stated plainly

redrob-auth supports a public client at the token endpoint: no `client_secret`
is required when the authorization used PKCE
(`oauth/token/route.ts:88`, and line 161 requires + verifies `code_verifier`;
line 174 rejects the no-PKCE-no-secret case). So the flow works today.

But the data model has no notion of a public client:

- `OAuthClient.secret` is `String`, **non-null** (`prisma/schema.prisma:142`),
  and both creation paths always generate one (`store.ts:373`,
  `scripts/onboard-client.ts`).
- There is no `tokenEndpointAuthMethod` column, so nothing records that this
  client is meant to authenticate with PKCE alone.
- `validateClient` skips the secret check only because none was *sent*
  (`store.ts:415`). A secret that leaks is therefore a fully valid credential
  for this client, and no server-side setting refuses it.

Consequences we accept, and the one we should fix upstream:

1. The generated secret for this client is **an operational secret with no
   consumer**. It must never be committed, shipped, or put in CI. The safest
   handling is to discard it at registration time and rotate it if it is ever
   seen.
2. Worth doing once in redrob-auth: a `tokenEndpointAuthMethod` of `none`, which
   makes the public client explicit and lets the token endpoint *refuse* secret
   authentication for it. Same additive-per-client shape as the existing
   `idTokenSignedResponseAlg` column.

## 4. Token handling the browser must implement

- **No local `id_token` verification.** redrob-auth signs HS256 by default with
  a service-wide secret and ships a deliberately empty JWKS until an RSA key is
  configured (`idTokenSignedResponseAlg` default, and Console's own note in
  `apps/api/src/auth/redrob-auth.service.ts:24-38`). The browser must call
  `/oauth/userinfo` with the fresh access token, as Console does. If the IdP
  moves this client to RS256 with a real JWKS, local verification becomes
  possible -- open decision 3 in the design doc.
- **Refresh rotation.** `/oauth/token` rotates refresh tokens
  (`rotateRefreshToken`, `oauth/token/route.ts`), so the browser must persist the
  *new* refresh token on every refresh and treat reuse as a signed-out state.
- **Storage.** Refresh token goes through OSCrypt, like the provider secrets
  already do in `redrob_prefs`. It must not land in a plain pref.
- **Single sign-on.** Nothing is proxied through the engine. When the engine has
  already signed in on this machine, the browser's `/oauth/authorize` request
  lands on the existing redrob-auth session and completes without a second
  prompt. One consent, two independently revocable credentials.

## 5. Blockers and prerequisites

1. **Admin access to redrob-auth.** Registration needs an admin session cookie
   (`isUserAdmin`). Nothing in this repository can mint one.
2. **`scripts/onboard-client.ts` is broken** and must not be used as the
   fallback path: line 16 reads
   `const connectionString = 'DATABASE_URL';` -- the literal string, not
   `process.env.DATABASE_URL`. The guard on the next line is therefore always
   true and Prisma is handed `'DATABASE_URL'` as a connection string. The admin
   API route is the correct path anyway: it creates the `ClientFeatures` row in
   the same transaction (`store.ts:381`), which the flow resolution depends on.
3. **Which environment first.** `auth-dev.redrob.io` for development, with a
   separate client id per environment; production registration should wait until
   the loopback listener and token store are verified against dev.
4. **A Console sync API still does not exist.** This registration gives the
   browser an identity; it does not give it anywhere to sync to. Console has no
   table for tasks, routines or memory (design doc §1).

## 6. Order of work once a client id exists

1. Loopback listener + PKCE + code exchange against `auth-dev.redrob.io`,
   verified with a real sign-in on screen.
2. OSCrypt token store, refresh rotation, signed-out state.
3. Replace the sidebar account row's settings link with real sign-in state
   (it currently competes with upstream's "Sign in to Google?" promo, which the
   Glic/Google work already established we cannot honour).
4. Only then layer-1 sync, which needs the Console side built first.
