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

## What this does not cover

Only the branding string file. Google's name also reaches the user from the default search engine's
own name (correct — it is the engine), from `chrome://settings`' Google services page (correct — it
configures real Google services), and potentially from upstream features whose strings live in other
grd files. A second pass over `components/` and `chrome/browser/resources/settings/` would be needed
to call the survey complete.
