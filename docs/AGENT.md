# The agent's side of Redrob Browser

## One door: the window's CDP relay

The engine gives every CDP connection its own pages, cookies' working copy and V8 isolates. A
second connection would see none of the person's tabs. So the browser process is the only engine
client, one process and one engine per profile for all its windows, and it opens a relay on a
loopback port (`crates/redrob-shell/src/relay.rs`):

- Each relay client's requests go over the window's own engine connection. Request ids are
  renumbered and the reply is sent back under the client's id.
- Events with a `sessionId` go only to the client that attached that session. Browser-level
  events (`Target.*`, `Browser.download*`) go to every client.
- Only loopback peers are accepted. The relay address is written to
  `<data>/redrob-browser/Default/engine/ws-endpoint` with owner-only permissions, and removed when
  the window closes. Anyone who can read that file can drive every tab, which is why it is
  private to the user.

Playwright, Puppeteer and Redrob Code connect to that address like any CDP endpoint. Tabs of every
window are on it. `Target.getTargets` replies add `redrobWindow` (1 is the first window) and
`redrobAgent` to each tab the window shows.

## Windows

The first launch takes `<data>/redrob-browser/Default/instance.lock` (an OS file lock, freed when
the process ends) and starts the engine. A later launch finds the lock held, reads `ws-endpoint`
and sends `Redrob.openWindow { url }` over the relay, which the browser answers by opening a
window, then exits. Moving a tab to another window hands over the same target, so its history,
scroll position and form state stay. Incognito windows share their own process and a
memory-only engine (`incognito.lock`, `incognito-endpoint`).

## Agent tabs

A page the window did not open and no page opened (`Target.createTarget` from a relay client)
is an agent tab. The window marks it `[AI]` in the tab bar, leaves it out of the saved session,
and never offers to save a password typed in it.

## Command line

```bash
redrob-browser                      # open the window
redrob-browser open https://example.com
redrob-browser tab list             # id, URL, title, window, agent
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

Text starting with `/` (or `>`) goes to Redrob Code instead of a search: the window opens a session on
the Redrob Code server (setting `agent_server`, default `http://127.0.0.1:4096`, loopback only)
and posts the prompt with `prompt_async`, together with the tab's title and URL and how to drive
the browser.

## Signing in

The agent never sees a password (`docs/CREDENTIALS.md`). It sends `Redrob.login` through the relay:

```json
{ "method": "Redrob.login", "params": { "targetId": "<tab>", "username": "optional" } }
```

The relay never forwards this method to the engine. The window checks the vault policy for the
tab's committed origin, types the saved login into the page itself, and answers with an outcome
and a username only:

| outcome | meaning |
|---|---|
| `filled` | the browser typed the saved login into the sign-in form |
| `no-form` | no sign-in form on the page, or not an http(s) page |
| `no-login` | nothing saved for this site |
| `several-logins` | more than one saved; `usernames` lists them, ask again with one |
| `locked` | the vault is locked; the person has to unlock it |
| `blocked` / `never` | this site, or every site, is closed to the agent |

From the command line: `redrob-browser tab login <id> [--user name]`. Every attempt is in the
agent sign-in history.
