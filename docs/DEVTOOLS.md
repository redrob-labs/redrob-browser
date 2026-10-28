# Developer tools

## Built in

F12, Ctrl+Shift+I or Menu, then Developer tools, opens a panel on the right for the active tab
(`crates/redrob-shell/src/devtools.rs`):

| Panel | What it shows | From |
|---|---|---|
| Console | `console.*` output and uncaught errors; a prompt that runs JavaScript in the page | `Runtime.consoleAPICalled`, `Runtime.exceptionThrown`, `Runtime.evaluate` with `replMode` |
| Elements | The document tree with tags and attributes; the selected node's inline and computed style with a filter box | `DOM.getDocument` (depth -1), refreshed on request; `CSS.getComputedStyleForNode`, `CSS.getMatchedStylesForNode` |
| Network | Every request with method, status and type | `Network.requestWillBeSent`, `Network.responseReceived`; enabled per tab the first time the tools open on it |

### Elements

- Click a row to select it. Its inline style (from the `style` attribute) and its computed style
  (the page's own `getComputedStyle`) show under the tree. The filter box matches property names
  and values.
- Hover a row to highlight the element on the page: margin orange, border yellow, padding green,
  content blue, from `DOM.getBoxModel`.
- **Pick an element**: the next left click in the page selects the element under it
  (`DOM.getNodeForLocation`) instead of clicking it. While picking, the element under the pointer
  is highlighted and nothing reaches the page. Escape cancels. The tree opens down to the picked
  node, and is fetched again if the node is newer than the tree on screen.

### Highlights from any client

The engine has no overlay of its own, because the window draws the page. `Overlay.highlightNode`,
`Overlay.highlightRect`, `Overlay.highlightQuad` and `Overlay.hideHighlight` make the engine send
a custom event to every session on that page:

```json
{ "method": "Overlay.redrobHighlight", "params": { "model": { "content": [], "padding": [], "border": [], "margin": [], "width": 0, "height": 0 } } }
```

`model` is a `DOM.getBoxModel` model in viewport CSS pixels, or `null` to clear. The window draws
it over the active tab, so a full DevTools front end attached through the relay highlights on
the real window too. The window's own hover and pick use the same path.

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

- `CSS`: `enable`, `getComputedStyleForNode`, `getInlineStylesForNode` and
  `getMatchedStylesForNode` answer (`crates/obscura-cdp/src/domains/css.rs`).
  `getMatchedStylesForNode` returns the inline style and an empty `matchedCSSRules`: stylesheet
  rules, their sources and editing styles are not reported yet. Other `CSS` methods are accepted
  and do nothing.
- `Overlay`: the highlight methods above answer (`domains/overlay.rs`); `setInspectMode` and the
  grid and flex overlays are accepted and do nothing.
- `Debugger`, `Profiler`, `Performance` and a few more domains are accepted but do nothing: no
  breakpoints or sources and no profiler. Elements, Console and Network work.
