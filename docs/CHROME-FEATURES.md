# Chrome's features in the window

Window tabs are Chromium 156 through CEF (docs/CEF.md). On Linux and
Windows every page runs in CEF's **Chrome runtime style**, so Chrome's own
code does the feature: its PDF viewer, print preview, pickers, dialogs,
chrome:// pages and extensions. A Chrome style page is still a Chrome
browser *without a toolbar*: what Chrome hangs off its toolbar or location
bar (extension icons and popups, page info, the certificate viewer) has
nowhere to go, so the window draws those itself. `REDROB_ALLOY=1` switches
pages back to Alloy style.

**macOS:** CEF uses Alloy style for every page inside a parent NSView. The
`cef_window_info_t` documentation (CEF 156): "Alloy style will always be
used if |windowless_rendering_enabled| is true or if |parent_view| is
provided." Chrome style on macOS needs a window CEF creates itself (its
own NSWindow, or a Views `CefWindow`), which cannot sit inside our window's
view; `REDROB_MAC_HOSTED=1` keeps such a window over the page area as a
child window instead (docs/CEF.md "Pages as Chrome windows"; then the
Linux / Windows column applies, unverified on a Mac).
The macOS column says what Alloy gives; nothing in it was run on a Mac
(no macOS hardware on the build host; the code is checked with the
aarch64-apple-darwin target only).

Status: **works** = measured in our window on the shared display `:0`
(Linux, Chromium 156, CEF 156.3.0) with the result named; **CEF limit** =
no path in CEF, with the reason; **not measured** = the code path exists
but needs hardware or an account the host does not have.

| Feature | Linux / Windows (Chrome style) | macOS (Alloy) |
|---|---|---|
| PDF viewer | Works: a PDF opens in Chrome's viewer (page mean 0.467, toolbar 60,60,60) | Alloy's PDF viewer (CEF ships it) |
| Print preview | Works: `window.print()` and Ctrl+P open Chrome's print preview (chrome://print, 626x660, Cancel / Save) | System print dialog (Alloy has no preview) |
| Spell check | Works: en-US and ko Hunspell dictionaries; "sentense" gets [sentence, sen tense, ...], choosing one replaces it; "반갑슴니다" is underlined | macOS spell checker (NSSpellChecker) |
| Autofill: addresses | Works: an address saved in chrome://settings/addresses fills name, street, city, zip, phone and email from Chrome's dropdown (210x119) | CEF limit: Alloy has no autofill |
| Autofill: cards | Works on https: a saved Visa fills name, number and expiry (dropdown 268x119). On http Chrome shows its own "form is not secure" warning instead, as Chrome does | CEF limit: no autofill |
| Passwords | The window's vault saves and fills sign-ins (docs/CREDENTIALS.md); Chrome's password manager is off (`credentials_enable_service`) so nothing asks twice | Same (the vault is the window's) |
| Extensions: install | Works: Chrome Web Store "Add to Chrome" shows Chrome's install dialog; Dark Reader and uBlock Origin Lite installed into the profile | CEF limit: Alloy runs no extensions |
| Extensions: toolbar icons, menu, pinning | Works: the plug button lists every installed extension with Pin / Unpin; pins are Chrome's own `extensions.pinned_extensions`, so chrome://extensions agrees; pinned icons sit after the address field | Nothing to show (no extensions) |
| Extensions: popups | Works: a click opens the action's popup page under its icon, sized to its content (Dark Reader 276x580). Dark Reader's popup names the page (localhost:8471) and its Off button turns the page light (mean 0.20 -> 0.92). Closes on a click elsewhere, a click in the page, or another tab | Nothing to show |
| Extensions: actions without a popup | Works, as in Chrome on Linux: Chrome runs the action (its hidden toolbar holds the actions, docs/CEF.md "Pages as Chrome windows"), granting `activeTab` and running `onClicked`. Measured: an `activeTab`-only extension read the tab's title on click; an `activeTab` + `scripting` one changed the page title with `scripting.executeScript`. An action with a popup gets `activeTab` too (its popup read the tab's title). Windows: pages are Chrome windows there too (cef/host.rs), so the same path applies; not yet run on Windows. With `REDROB_CHILD_PAGES=1` (child pages) `onClicked` runs without `activeTab`, and `Extensions.triggerAction` would crash Chromium (no `ExtensionsContainer`) | Nothing to show |
| Extensions: badges | Works: `chrome.action.setBadgeText`, `setBadgeBackgroundColor` and `setBadgeTextColor` are drawn on the pinned icon as Chrome draws them, per tab and within a second of the call: a test extension's default "7" on red (14x14 px, #d00000) shows on every tab; its click sets "T1" green with yellow text on that tab only (the other tabs keep "7"), "T2" redraws 68 of the badge's 196 px; a reload clears the tab's own badge back to "7", as Chrome's `getBadgeText` then says. Not seen: the blocked-request count Chrome itself computes for `declarativeNetRequest` (`displayActionCountAsBadgeText`) | Nothing to show |
| chrome://extensions | Works: lists the installed extensions (3 items with an unpacked one) | Not available in Alloy |
| Picture in picture | Works: a video's PiP window "Picture in picture" 331x186 | CEF limit: Alloy has no PiP window |
| Media keys | Works: MPRIS `org.mpris.MediaPlayer2.chromium.instance<pid>`; Next / Pause reach the page's `mediaSession` handlers | Not measured |
| Screen sharing | Works: `getDisplayMedia` opens Chrome's screen picker; Escape gives NotAllowedError | Not measured (Alloy asks through the window's permission prompt; no picker) |
| WebAuthn / passkeys | Works: Chrome's WebAuthn dialog shows over the page. A real security key or phone was not tried | CEF limit: Alloy has no WebAuthn UI |
| WebUSB chooser | Works: `navigator.usb.requestDevice` waits on Chrome's chooser (452x448); Escape gives NotFoundError "No device selected" | CEF limit: no chooser in Alloy, requests fail |
| WebHID chooser | Works: Chrome's chooser (452x472); Escape resolves with no device | CEF limit, as above |
| Web Serial chooser | Works: Chrome's chooser; Escape gives NotFoundError "No port selected by the user" | CEF limit, as above |
| Web Bluetooth chooser | Works as far as this host allows: the API is on (Chromium leaves it off on Linux; the window turns it on, as Chrome has it elsewhere) and Chrome answers NotFoundError "Bluetooth adapter not available": the host has no adapter or BlueZ, so the chooser itself is not measured | CEF limit, as above |
| File pickers | Works: `showOpenFilePicker`, `showSaveFilePicker`, `showDirectoryPicker` and `<input type=file>` open the desktop's file dialog (xdg portal) | System file dialog |
| Protocol handlers | Works: `mailto:` / `tel:` links ask "Open with another app?" and hand the link to the system; schemes a site registered with `registerProtocolHandler` go to that site | Same (window code) |
| Notifications | Works: `new Notification` shows on the desktop (xfce4-notifyd), after the window's permission prompt | CEF limit: Alloy shows none |
| Geolocation | CEF limit on Linux: Chromium gets a position on Linux only from Google's network location service, which needs Google's API keys; CEF builds have none, so `getCurrentPosition` times out (code 3). Windows uses the system location provider (not measured) | System location (CoreLocation), not measured |
| Translate | CEF limit: Chrome translates only with Google's API keys (TranslateManager refuses without them), so command 35009 stays disabled; the page menu offers Translate only where Chrome can | Same |
| Reading mode | Works (the window's own): the main menu's "Reading mode" (also the page menu's "Open in reading mode") shows the article alone (Wikipedia "Web browser": 23 paragraphs, no navigation or scripts, light column); again reloads the page. Chrome's own reading mode is a side panel (no place without a toolbar) and its DOM distiller scheme is not registered in CEF | Same (window code) |
| Page info, site settings | Works (the window's): the lock or globe in the address bar opens the connection state (secure for example.com, "not private" for self-signed.badssl.com, "not secure" for http), the site's saved permissions with Allowed / Blocked and Reset, "Delete cookies and site data", and "Site settings" (chrome://settings/content/siteDetails) | Same; Site settings is a Chrome page (not in Alloy) |
| Certificate viewer | Works (the window's): issued to / by, validity, serial, SHA-256 and SHA-1, the chain, Copy certificate (PEM). For example.com every value matches `openssl s_client` (SHA-256 85:CA:6A:B0:...:F0:7A, serial 01:EE:E6:AA:..., 2026-09-26 to 2026-12-25) | Same |
| Downloads, history, settings | The window's own downloads bar, history and settings pages; Chrome's chrome://downloads ("Download history"), chrome://history ("History") and chrome://settings ("Settings") also open and render | The window's own pages |
| Task manager | Works: Chrome's task manager window (command 40006) | CEF limit: Chrome UI |
| View source | Works: `view-source:` pages render; the page menu's "View page source" opens one in a new tab | Same |
| Save page | Works: page menu "Save as" (command 35004) opens the save dialog (xdg portal) | CEF limit: Chrome command |
| Reopen closed tab | Works: Ctrl+Shift+T brings the closed tab back (9 -> 8 -> 9 tabs, same address in front) | Same (window code) |
| Cast | Works: Chrome's Cast dialog at the page's top right (command 35011); no receiver on this network | CEF limit: Chrome UI |
| QR code | Works: Chrome's QR code bubble (command 35021) | CEF limit: Chrome UI |
| Find | Works: Ctrl+F opens the window's find bar, typing finds in the page | Same (window code) |
| Zoom | Works: Ctrl++ makes `devicePixelRatio` 1.1, Ctrl+0 back to 1; remembered per site | Same (window code) |
| Chrome dialogs above the window | Works: Chrome's dialogs (install, picker, task manager) are kept transient for their browser window, so a click on the window does not bury them | n/a |

## How the window does what Chrome's toolbar would

- **Extensions** (`cef/handlers/extensions.rs`): the installed list comes
  from Chrome's `extensions.settings` preference and each extension's
  manifest (name, `__MSG_` names in the window's language, the action icon
  nearest 32 px, `default_popup`). A popup opens as a page of its own over
  the page, in Alloy style: a Chrome style page would be a Chrome window
  of its own, which Chrome then calls the last focused one, and an
  extension's background would act on the popup instead of the page.
  Before the popup's first script the window fixes `chrome.tabs.query`
  and `chrome.windows.getCurrent` / `getLastFocused` there so "the current
  window" is the page's (a script added for new documents does not run in
  extension pages, so the window stops the page in the debugger first),
  and in the extension's background it counts the window's pages as
  "normal" windows: CEF makes every Chrome style browser in a parent window
  a "popup" type window, and extensions such as Dark Reader look for tabs
  in normal windows only.
  Badges: a script in each running extension context (its worker, popup
  and pages) wraps `chrome.action.setBadge*` and keeps each value with its
  time and the tab's window; the window reads those once a second with
  plain JavaScript, so reading never keeps a worker awake. A worker that
  has not reported since the window started is woken once and asks Chrome
  for what it kept (`getBadge*`). A tab's own values count only when set
  after its page last committed a document, as Chrome clears them then.
- **Page info and certificate** (`cef/handlers/site_info.rs`): from CEF's
  `CefSSLStatus` and `CefX509Certificate` of the page's visible navigation
  entry.
- **Reading mode** (`cef/handlers/reader.rs`): a script in the page.
