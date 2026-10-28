# Developer tools

## Built in

F12, Ctrl+Shift+I or Menu, then Developer tools, opens a panel on the right for the active tab
(`crates/redrob-shell/src/devtools.rs`):

| Panel | What it shows | From |
|---|---|---|
| Console | `console.*` output and uncaught errors; a prompt that runs JavaScript in the page | `Runtime.consoleAPICalled`, `Runtime.exceptionThrown`, `Runtime.evaluate` with `replMode` |
| Elements | The document tree with tags and attributes | `DOM.getDocument` (depth -1), refreshed on request |
| Network | Every request with method, status and type | `Network.requestWillBeSent`, `Network.responseReceived`; enabled per tab the first time the tools open on it |

## The full DevTools front end

Any DevTools front end can attach to one tab through the window's relay, which serves a
per-tab endpoint at `/devtools/page/<targetId>`: the relay attaches to the tab and speaks for that
session, the way Chrome's own per-page endpoints do.

```text
devtools://devtools/bundled/devtools_app.html?ws=127.0.0.1:<port>/devtools/page/<targetId>
```

Open that in Chrome, with the port from `<data>/redrob-browser/Default/engine/ws-endpoint` and a
target id from `redrob-browser tab list`.

## What the engine does not answer yet

The engine accepts `CSS`, `Debugger`, `Profiler`, `Overlay`, `Performance` and a few more domains
but does nothing for them. In a full front end this means no Styles pane, no breakpoints or
sources, no profiler and no element highlighting on the page. Elements, Console and Network work.
