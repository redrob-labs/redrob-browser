# The agent's side of Redrob Browser

## One door: the window's CDP relay

The engine gives every CDP connection its own pages, cookies' working copy and V8 isolates. A
second connection would see none of the person's tabs. So the window is the only engine client,
and it opens a relay on a loopback port (`crates/redrob-shell/src/relay.rs`):

- Each relay client's requests go over the window's own engine connection. Request ids are
  renumbered and the reply is sent back under the client's id.
- Events with a `sessionId` go only to the client that attached that session. Browser-level
  events (`Target.*`, `Browser.download*`) go to every client.
- Only loopback peers are accepted. The relay address is written to
  `<data>/redrob-browser/Default/engine/ws-endpoint` with owner-only permissions, and removed when
  the window closes. Anyone who can read that file can drive every tab, which is why it is
  private to the user.

Playwright, Puppeteer and Redrob Code connect to that address like any CDP endpoint.

## Agent tabs

A page the window did not open and no page opened (`Target.createTarget` from a relay client)
is an agent tab. The window marks it `[AI]` in the tab bar, leaves it out of the saved session,
and never offers to save a password typed in it.

## Command line

```bash
redrob-browser                      # open the window
redrob-browser open https://example.com
redrob-browser tab list             # id, URL, title
redrob-browser tab open https://example.com
redrob-browser tab read <id>        # outline with [ref=N] handles
redrob-browser tab click <id> <ref>
redrob-browser tab type <id> <ref> "text" --submit
redrob-browser tab key <id> Enter
redrob-browser tab scroll <id> 600
redrob-browser tab shot <id> page.png
redrob-browser tab markdown <id>
redrob-browser tab close <id>
```

`REDROB_BROWSER_CDP` overrides the address read from `ws-endpoint`. `redrob-browser serve` still
starts a separate headless engine with its own pages, for automation that does not need the
person's window.

## The address bar

Text starting with `>` goes to Redrob Code instead of a search: the window opens a session on
the Redrob Code server (setting `agent_server`, default `http://127.0.0.1:4096`, loopback only)
and posts the prompt with `prompt_async`, together with the tab's title and URL and how to drive
the browser.

## Signing in

The agent never sees a password (`docs/CREDENTIALS.md`). Its sign-in request has to reach the
window, which alone holds the vault key, so it will be a relay-handled method (`Redrob.login`)
answered by the window with a username and an outcome. It is not built yet; until then the agent
asks the person to sign in.
