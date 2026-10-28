# Protected video (DRM)

Streaming services lock most of their video with a vendor DRM system: Widevine (Google),
PlayReady (Microsoft) or FairPlay (Apple). Each needs a closed decryption module (a CDM)
licensed by its vendor. The Redrob Browser engine does not carry one, and cannot: the vendors
license their CDMs to browser makers on their own terms.

So the engine does two things:

1. It offers the W3C **Clear Key** system (`org.w3.clearkey`), which needs no vendor module.
2. When a page asks for Widevine, PlayReady or FairPlay, it says no, and the window offers to
   open the page somewhere that has the module.

## What works where

| | Windows | macOS | Linux |
|---|---|---|---|
| EME API with Clear Key in the engine | yes | yes | yes |
| Clear Key video actually decrypting | not yet | not yet | not yet |
| Bar on a tab that asked for DRM | yes | yes | yes |
| "Open in a protected tab" (system web view) | WebView2 | WKWebView | not offered |
| "Open in your default browser" | yes | yes | yes |

## The engine side (`crates/obscura-js/js/bootstrap.js`)

- `navigator.requestMediaKeySystemAccess`, `MediaKeySystemAccess`, `MediaKeys`,
  `MediaKeySession`, `MediaKeyStatusMap`, `MediaKeyMessageEvent`, `MediaEncryptedEvent`,
  `HTMLMediaElement.mediaKeys`, `setMediaKeys()` and the `encrypted` event follow the EME spec
  for Clear Key.
- Accepted: `initDataTypes` `cenc` (Common PSSH, version 1), `keyids` and `webm`; MP4 and WebM
  content types; `temporary` sessions only. `persistent-license` and a required distinctive
  identifier are refused, as Clear Key does in other browsers.
- `generateRequest()` fires a `message` event with the Clear Key licence request
  (`{"kids":[...],"type":"temporary"}`). `update()` takes the JSON Web Key set the page fetched,
  records the keys on the session and marks them `usable` in `keyStatuses`.
- Nothing is decrypted yet. The keys wait on the session for the media pipeline
  (`__redrobClearKeys(session)`), and `__redrobMediaEncrypted(id, type, base64)` is the hook the
  pipeline calls when it finds init data in a stream.
- Any other key system rejects with `NotSupportedError`. For `com.widevine.alpha`,
  `com.microsoft.playready*` and `com.apple.fps*` the page also calls the `redrobDrm` binding
  once with `{keySystem, url}`. Without a window (`redrob-browser serve`, `fetch`) there is no
  binding and the call is only a rejection.

## The window side (`crates/redrob-shell`)

- `cdp.rs` adds the `redrobDrm` binding to every tab and turns its calls into
  `Event::DrmRequested { key_system }`.
- `drm_tab.rs` keeps which tabs asked and draws the bar "This video is protected. Open it where
  it can play?" on that tab. The bar goes away when the tab navigates or the person picks an
  answer.
- **Open in a protected tab** starts `redrob-browser-protected <url> <lang>`, installed next to
  the window. It is its own program because eframe owns the window's event loop and tao needs
  its own on the main thread. It opens one OS window with a `wry` web view: WebView2 on Windows,
  WKWebView on macOS.
- **Open in your default browser** hands the URL to the OS (`open` crate: `xdg-open`, `open`,
  or PowerShell `Start-Process` with the URL in an environment variable), never through a shell
  command line.
- Only `http` and `https` URLs leave the window, in both cases.

## What decides whether the video plays

The protected tab is the operating system's web view, so playback depends on the CDM that web
view has, and on what each service allows:

- WebView2 is built from Microsoft Edge and carries the DRM modules its runtime ships.
  PlayReady is the one Windows provides; Widevine depends on the installed WebView2 runtime.
- WKWebView on macOS has FairPlay only.
- A service can still refuse an embedded web view, cap the resolution, or require its own app.
  Redrob Browser does not change any of that.

## The agent cannot drive the protected tab

The protected tab has no CDP endpoint and no tie to the engine. Agents, `redrob-browser tab`
and the developer tools do not see it, read it, or type into it. It is a plain window for the
person to watch the video in.

## Not yet

- Decrypting Clear Key content in the media pipeline (`docs/MEDIA.md`).
- Keeping the protected tab's cookies in step with the person's profile: it signs in on its own.
