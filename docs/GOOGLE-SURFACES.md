# Where this browser says "Google", and which of those are right

This fork is built on Chromium, so a user signing in to Google is not a branding leak — it is the
platform working as intended, and the sign-in and sync surfaces that come with it stay. What must not
stay is Google's name on a capability **we** provide with our own engine, or on a feature this fork
does not ship at all.

The rule, in one line: **keep Google's name where Google does the work; take it off where we do.**

Surveyed from `chrome/app/chromium_strings.grd`, the branding file this fork actually builds with:
81 messages mention Google. They fall into four groups.

## 1. Keep — Google genuinely does the work

The account is a real Google account and the data really does travel to it. These are also the answer
to "why doesn't bookmark sync work": in a Chromium fork, bookmark sync *is* Google sign-in plus
Chrome Sync, and the strings already say so.

| Message | What it says |
|---|---|
| `IDS_AVATAR_BUTTON_SIGNIN_PROMO` | "Sign in to Google?" |
| `IDS_BOOKMARK_INSTALLED_BUBBLE_PROMO_EXPLICIT_SIGNIN_MESSAGE` | a saved bookmark goes to the Google Account |
| `IDS_AUTOFILL_SIGNIN_PROMO_SUBTITLE_PASSWORD` / `_ADDRESS` | passwords and addresses on all devices |
| `IDS_CHROME_SIGNOUT_CONFIRMATION_PROMPT_*` (8) | what leaves the device on sign-out |
| `IDS_SYNC_*_BUBBLE_VIEW_MESSAGE_2`, `IDS_SYNC_PASSPHRASE_DIALOG_BODY` | sync errors and the passphrase |
| `IDS_SIGNIN_DICE_WEB_INTERCEPT_*`, `IDS_SIGNOUT_DICE_WEB_INTERCEPT_*` | sign-in/out interception bubbles |
| `IDS_ENTERPRISE_SIGNIN_EXPLANATION_*` | a managed account's administrator |
| `IDS_SETTINGS_CLEAR_BROWSING_DATA_SIGNED_IN` | device-only deletion |
| `IDS_CONTENT_CONTEXT_SPELLING_BUBBLE_TEXT` | enhanced spell check really is a Google service |
| `IDS_CONTENT_CONTEXT_ACCESSIBILITY_LABELS_BUBBLE_TEXT` | image descriptions really are a Google service |

Two of these deserve a decision rather than an edit: enhanced spell check and image descriptions send
page content to Google. They are honestly labelled, so they stay — but this fork also has an engine
that could do both locally, which is a product choice to make deliberately, not by leaving the default.

## 2. Change — we provide this, so Google's name is wrong

| Message / code | Why it is wrong |
|---|---|
| `IDS_PROFILE_PICKER_MAIN_VIEW_TITLE_GLIC_NO_PROFILE` and the three other `*_GLIC*` strings | They advertise upstream's own in-browser assistant and tell the user to sign in to Google to get it. The assistant in this product is ours. A user following these strings is being sent to a feature this fork does not ship. |
| `IDS_SESSION_CRASHED_VIEW_UMA_OPTIN` | "sending crash reports and usage statistics to Google" — our crash reporting is not wired to Google, so this both names the wrong recipient and misstates where a user's data goes. |
| `redrob.ts` search submit | Not a string but the same class: the Search segment hardcodes `https://www.google.com/search?q=`, and its own TODO admits changing the default engine in settings does not change it. Whatever the default engine is, our own surface must use it. |

## 3. Remove — the feature does not exist here at all

The whole `IDS_IOS_DESKTOP_*` family (about 20 strings) promotes a companion iOS app — "Use Google's
best AI tools with the Redrob app on your phone", "Try Google Lens with Redrob on your phone", "Google
Password Manager", "Get the best of Google". There is no iOS app, and per the roadmap a phone cannot
run this engine at all. These are a false promise twice over: an app that does not exist, advertising
Google features this fork does not provide.

**Resolved, and not the way it looked.** Nothing renders them. Searched for a consumer of these ids
across every `.cc`, `.h`, `.ts` and `.html` in the checkout: the only hit is the generated
`branded_strings.h`, which is the id header rather than a use. So there is no entry point to remove in
this Chromium version — they are dormant text in the branding file. Deleting twenty strings out of an
upstream `.grd` would add merge conflicts at every uprev for no change a user could see, so they stay
and this paragraph is the record of why. If a future uprev wires those promos up, the entry point is
what to remove then.

**Glic was the opposite case and is now off.** Upstream's own assistant is not dormant: `kGlic` is
`FEATURE_ENABLED_BY_DEFAULT` on macOS, Windows and ChromeOS, and only disabled on Linux. What kept it
out of a macOS or Windows build of this fork was a chain of conditions we do not control — a rollout
flag, an account capability, country and locale filters — so a change on Google's side could have
surfaced a second, competing assistant inside a product that ships its own. It is now disabled on every
platform through one line, upstream's documented kill-switch. Verified that this reaches the entry
points rather than only the text: the toolbar button, the tab-strip action container, the side panel,
the profile manager and the profile picker all gate on `GlicEnabling`, whose `IsProfileEligible()` is
`feature_enabled && is_regular_profile` with `feature_enabled` reading exactly that feature. No upstream
code is deleted.

Note what the Linux screenshot after that change can and cannot show: Linux had the feature off
already, so it evidences no regression, not a removal. The change earns its place on the platforms
whose CI builds and launches the browser — Windows and macOS — and that is where it should be looked at.

## 4. Already correct, or not reachable

`IDS_PRODUCT_NAME`, `IDS_ABOUT` and the window-title formats have variants reading "Google Chrome for
Testing"; those are upstream's `is_chrome_for_testing` branch, which this fork does not build. The
`ChromiumOS` strings are the Chrome OS variants. `$1www.google.com` in the extension-data checkbox is a
placeholder's example, not our text.

One genuine gap sits here rather than above. `chrome://version` renders "The Chromium Authors" and
"Copyright 2026 The Chromium Authors. All rights reserved." — verified on screen. That is not a Google
leak, but it contradicts `branding/BRANDING`, which declares `COMPANY_FULLNAME=Redrob` and a copyright
reading "Copyright <year> Redrob. Portions copyright The Chromium Authors." The one page a user opens
to check what they are running attributes the product to someone else. `IDS_ABOUT_VERSION_COMPANY_NAME`
and `IDS_ABOUT_VERSION_COPYRIGHT` are separate strings from the BRANDING file and were never brought
into line with it.

## Second pass: `components/` and the settings UI

The first pass read one string file. This pass covers the rest of the user-visible surface, and it
found something that changes the first pass's verdicts rather than adding to them.

### This build has no Google API key, and cannot be given one at runtime

Three independent confirmations:

- The browser's own log, at startup: `API key GOOGLE_API_KEY=dummytoken`. That value is
  `DefaultApiKeys::kUnsetApiToken` — the sentinel meaning "unset".
- `SUPPORT_EXTERNAL_GOOGLE_API_KEY` is `0` in this build's generated buildflags, so the environment
  variables that would otherwise supply a key at runtime are not even read.
- `google_apis/internal/` is absent and no key appears in `build/args/*.gn` or the CI workflows.

The OAuth client id and secret come from the same unset sentinel, and they are what sign-in needs.

**So Chrome Sync cannot work in this build, and neither can Google sign-in.** Upstream evidently knows:
`chrome://settings/syncSetup` redirects to `chrome://settings/people`, and that page offers **no sign-in
or turn-on-sync row at all** — the entry point removes itself when there is no client to authenticate
with. Verified on screen.

This is the real answer to "bookmark sync doesn't work", and it is a level deeper than the first pass
said. Bookmark sync is not merely gated behind signing in: **there is nothing to sign in with.** Every
Google-API-backed feature is in the same position — Safe Browsing lookups, the account password store,
Google Pay autofill, translate, enhanced spell check, image descriptions. The strings for all of them
ship and read correctly; the services behind them cannot be reached.

The one place that still advertises sign-in is **ours**: our sidebar shows "Sign in to Google?" at
launch, while upstream's own settings page has already withdrawn the offer. Whatever is decided about
credentials, that pill should not promise what the build cannot do.

Making it real is not a code change. It needs OAuth credentials for a Chromium-derived browser and
agreement to the terms attached to them — a product and legal step, and the prerequisite for the whole
"keep" group above meaning anything.

### Feature-level rulings for the rest

Hundreds of strings mention Google across `components/` (autofill 224, payments 135, omnibox pedals 81,
passwords 38, browsing data 37, policy 35, security interstitials 34) and the settings UI (196 in
`settings_strings.grdp`, 92 files under `chrome/browser/resources/settings/`). Ruling per string would
be noise; the rule applies per feature, and every one of these is the same case: **the feature really is
Google's, so its name stays, and what is wrong is that it cannot function.** Google Pay, Google Password
Manager, Safe Browsing, the omnibox pedals that manage a Google Account, Chrome Sync, enterprise policy
text — all correctly named, all inert without credentials.

Two notes worth keeping from this pass. `settings_chromium_strings.grdp` and
`settings_google_chrome_strings.grdp` are branding variants and this fork builds the *chromium* one, so
that is the file to read when settings text looks wrong. And `chrome://settings/people` carries **"Import
bookmarks and settings"**, a second entry point to the import flow besides onboarding's — worth knowing
when testing whether import works.

## What should run on our own engine instead

Checked the defaults rather than assuming them, and the answer is not "route everything": two of these
are already local, one must NOT be routed, and one is worth building.

**Already local, nothing to do.** Enhanced spell check registers `false` — the default spell checker is
the bundled Hunspell dictionary, which runs on the machine and is *better* at spelling than an inference
engine would be. Image descriptions register `false` too, so nothing is sent anywhere unless a user asks
for it per image.

**Worth routing to our engine: image descriptions.** `AccessibilityLabelsService::BindImageAnnotator`
has an explicit binder override; when one is installed, the Google-backed `ImageAnnotationService` — the
thing constructed with `google_apis::GetAPIKey()` — is never created. The interface to implement is one
method, `AnnotateImage(source_id, language_tag, ImageProcessor) => (AnnotateImageResult)`, whose result is
either an error code or annotations of `{type, text, score}`. And in this build the Google path is dead
anyway: with no key the request goes out unauthenticated and is refused, so a user who opts in today gets
nothing. Our engine is not just the private option here, it is the only one that could work.

Two honest caveats before anyone starts: the engine's image input is NOT confirmed — it advertises
`chatCompletions` with tools and streaming, and says nothing about images — and with no account
configured it cannot answer at all on this host, so the feature could be written but not verified
end to end. Writing an unverifiable feature is how the stub problem happened; this one waits for an
engine that can answer.

**Must not be routed: Safe Browsing.** It is threat intelligence — a continuously maintained list of
known-bad URLs and hashes — not something to infer. An engine guessing whether a URL is malicious would
be a downgrade wearing a feature's clothes.

But it is the most serious thing this survey found, because it is not a naming problem. `kSafeBrowsingEnabled`
registers **`true`**, its protocol managers authenticate with `google_apis::GetAPIKey()`, and that key is
`dummytoken` — so the lookups cannot authenticate. Meanwhile `chrome://settings/security` says, on the
default setting, "Provides strong protection", "Google uses less data … to detect threats", and "Google
Safe Browsing — Protects you from dangerous sites, downloads, and extensions". Verified on screen. The
browser promises protection it cannot deliver, and unlike a wrong label this one could get somebody hurt.
It needs the real key; until there is one, the page should not make that claim.

**Not routable at all**: the account password store and Google Pay autofill are an account's contents,
not a capability. **Large, and not now**: full-page translation has no override seam of this kind, so it
is a project rather than a switch.
