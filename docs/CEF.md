# Chromium (CEF) in the window

Status: in progress (branch `feat/cef`).

## Decision

Window tabs run on Chromium through CEF (Chromium Embedded Framework). The
headless agent engine (`redrob-browser fetch | scrape | serve | mcp`) stays on
Obscura.

Why: sites expect Chrome. With our own engine they broke in three layers:
the TLS/HTTP-2 fingerprint (Stack Overflow and Google block on the first
request; BoringSSL cannot produce Chrome's ClientHello), missing JS behaviour
that bot challenges probe, and missing web platform features and layout
differences. Chromium removes all three at once. Every other agentic browser
(Comet, Dia, Atlas) made the same choice.

We do not build Chromium. CEF ships prebuilt binaries per platform; the
`cef` crate (tauri-apps/cef-rs, Apache-2.0 OR MIT, version
`156.3.0+156.0.15` = Chromium 156) downloads them and generates Rust
bindings. Chromium security updates arrive as a `cef` crate bump.

## Shape

```
redrob-browser-window (one process per profile, CEF browser process)
  ├ egui chrome: tabs, toolbar, address bar, bookmarks, menus   (unchanged)
  ├ cef/        CEF app + client + handlers                     (new)
  │   ├ off-screen rendering, accelerated: OnAcceleratedPaint hands a GPU
  │   │  texture (dmabuf / IOSurface / D3D11 shared handle) -> wgpu texture
  │   │  -> drawn as the page layer by the compositor
  │   ├ input: egui mouse / wheel / key / IME -> BrowserHost::send_*_event
  │   └ events: display / load / life-span / download / ... handlers -> cdp::Update
  ├ remote debugging on 127.0.0.1:<random port> -> Chrome DevTools Protocol
  │   used by agents (relay.rs, `redrob-browser tab`, MCP) and by cdp.rs
  └ CEF subprocesses: renderer, GPU, utility = the same executable
     (macOS: "Redrob Browser Helper*.app" bundles)

redrob-browser (CLI, MCP, headless serve)  -> Obscura engine, unchanged
```

The window's contract with the engine stays `cdp::Op` in, `cdp::Update` out
(`crates/redrob-shell/src/cdp.rs`). The CEF backend answers it. Events that
only existed because our engine lacked features (scene channel, wheel answer,
media element bridge, MSE, DRM tab, our own DevTools panel, highlight overlay)
go away: Chromium scrolls, plays media and has its own DevTools.

`crates/redrob-shell/src/cef/mod.rs` defines `Sink`: CEF callbacks report
`cdp::Event`s for a CEF browser id; the sink maps it to the window `TabId`.

## Profiles

- One `RequestContext` per profile with `cache_path` = the profile's data dir
  (`profile.rs`), so cookies, localStorage, IndexedDB and the HTTP cache
  persist like Chrome's.
- Incognito: a `RequestContext` with an empty `cache_path` (memory only).
- Import from Chrome (`import_chrome.rs`): write cookies through
  `CookieManager::set_cookie`; history and bookmarks stay in our model.

## Work split

| Part | Branch | Owns |
|---|---|---|
| C1 core | `feat/cef-core` | `cef/mod.rs`, `cef/app.rs`, `cef/client.rs`, `cef/osr.rs`, `cef/input.rs`, `cdp.rs`, `engine.rs`, `browser.rs`, `main.rs`, `compositor/`, `input.rs`, removing the Obscura scene path from the window |
| C2 agents | `feat/cef-agent` | `relay.rs`, `agent_bridge.rs`, `instance.rs`, the CLI `tab` command and MCP window bridge in `obscura-cli` / `obscura-mcp` |
| C3 features | `feat/cef-features` | `cef/handlers/*.rs`, `profile.rs`, `import_chrome.rs`, `vault.rs` |
| C4 packaging | `feat/cef-package` | `.github/workflows/release.yml`, `installer/`, `scripts/`, `self_update.rs`, `updater.rs`, `NOTICE`, `docs/RELEASE.md` |

C1 wires the handlers C3 writes: each `cef/handlers/<name>.rs` exposes
`pub fn new(sink: super::super::Sink, ...) -> cef::<Name>Handler` and C1's
client returns it from `get_<name>_handler`.

## Risks

- Size: the release archive grows by about 100 MB per platform.
- Codecs: CEF's prebuilt binaries leave out H.264 and AAC. YouTube serves
  VP9/AV1 with Opus. Widevine needs the CDM component (Windows, macOS).
- macOS: every helper app is signed and notarized with the main app.
