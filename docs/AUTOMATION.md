# Driving this browser from outside it

Two audiences, and they want different things. A person at a terminal wants to type one line and get an
answer. Another program -- an agent, a script, CI -- wants a contract.

There is no `redrob` command in this repository, and that is a decision rather than a gap. Read on for
why, because the reasoning is the useful part.

## Why there is no browser CLI

There was one, briefly: `cli/redrob`, a Python wrapper that started a task over the local endpoint and
streamed the answer to stdout. It was deleted, for two reasons.

**The name was already taken.** Redrob Code's binary IS `redrob` (`packages/redrob/package.json` ->
`bin: { redrob }`). Two commands called `redrob` on one PATH is not a product, and renaming the wrapper
to `redrob-browser` would only have made the second reason easier to see.

**It duplicated an agent that already exists.** Redrob Code is the agent you run in a terminal. What it
cannot do is act inside the browser session you are already signed in to -- and that gap is the entire
reason this fork exists, since a Korean bank or government site will not serve a headless fetch. But the
gap is closed by the MCP server, not by a second CLI: Redrob Code speaks MCP as a client, so pointing it
at this browser makes the browser a TOOL of the agent you already use. One command, one agent, the
browser as a capability.

What a wrapper still had going for it was deterministic scripting -- an exit code for CI, no model in the
loop. That is served by the HTTP endpoint below, with `curl`, in fewer moving parts than a wrapper that
would have to be installed and kept in step with the endpoint it wraps.

## The two paths

### 1. A command line, with no setup

The browser binary takes a task directly:

    <browser-binary> --redrob-task="summarise the release notes on the page I have open"

If a browser is already running for that profile, the process singleton hands the command line to it, and
the task opens as a tab there. If none is, this launches one.

Nothing is printed. That is not a missing feature: the singleton channel carries a command line one way
and answers with an acknowledgement, sending it the moment the callback accepts and before the work is
even posted -- there is no payload, no exit code and no stdout coming back through it. The task runs at
Guard and Standard effort, because a command line cannot say otherwise and a switch that silently granted
more than the composer's own default would be the widest permission in the product hiding in the
narrowest-looking place.

Use this when you want the browser to start something and you will read the answer in the browser.

### 2. The local endpoint, for anything that needs an answer back

Off by default. Turn it on in **Settings -> Command line**, or pass `--redrob-rpc` for one run.

It is off by default because a local HTTP server that can drive this browser is, to any other process on
this machine, this browser -- with your logins. So: loopback only on a port the system picks; a bearer
credential generated fresh each launch and checked before anything looks at the path; that credential in
a file inside the profile directory with owner-only permissions, which puts reading it behind the same
boundary as reading the cookie database.

**Finding it.** The browser writes `redrob-cli.json` into the profile directory:

```json
{
  "endpoint": "http://127.0.0.1:39645",
  "token": "<44 base64 characters>",
  "profile": "Default",
  "pid": 1204002
}
```

**Do the handshake before you send the credential.** A browser killed outright never deletes that file,
so the address in it can be a port some unrelated process has since bound. Ask who is listening first --
`GET /hello` needs no credential -- and compare:

```bash
curl -s "$ENDPOINT/hello"
# {"pid":1204002,"profile":"Default","server":"redrob"}
```

Send the credential only when `server` is `redrob` and `pid` matches the file. If it does not, the file
is stale; a client that skipped this step would have handed its credential to whatever took the port.

**Routes.** Every one except `/hello` needs `Authorization: Bearer <token>`.

| Method | Path | What it does |
| --- | --- | --- |
| `GET` | `/hello` | Who is listening. No credential. |
| `POST` | `/task` | `{prompt, mode?, effort?}` -> `{task_id, stream}`. `mode` is `read-only`, `guard` or `full-access` (anything unrecognised is treated as `guard`, never widened); `effort` is `quick`, `standard` or `ultrabrowse`. |
| `GET` | `/task/<id>` | The task's state, trace and answer. `done` is false while it works. |
| `GET` | `/task/<id>/stream` | The same, as server-sent events, held open. |
| `POST` | `/task/<id>/follow-up` | `{prompt, when?}`. `when: "now"` interrupts; anything else queues until the current step finishes. |
| `POST` | `/task/<id>/cancel` | Stops it. |
| `POST` | `/mcp` | JSON-RPC 2.0. See below. |

A whole task from a shell, streaming:

```bash
HANDLE="$HOME/.config/redrob/Default/redrob-cli.json"
ENDPOINT=$(python3 -c "import json;print(json.load(open('$HANDLE'))['endpoint'])")
TOKEN=$(python3 -c "import json;print(json.load(open('$HANDLE'))['token'])")

# Verify before authenticating.
curl -sf "$ENDPOINT/hello" | grep -q '"server":"redrob"' || { echo "stale handle"; exit 1; }

TASK=$(curl -s -H "Authorization: Bearer $TOKEN" "$ENDPOINT/task" \
  -d '{"prompt":"what does this page say about refunds","effort":"quick"}' \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['task_id'])")

curl -sN -H "Authorization: Bearer $TOKEN" "$ENDPOINT/task/$TASK/stream"
```

Each SSE frame is the whole task, so a client that reconnects or joins late is not missing anything:

```
data: {"done":false,"id":"...","state":"running","answer":"Looking up the subscription page ",
       "steps":[{"label":"Opened the subscription settings page","details":["http://..."]}]}
```

Captured frames are deliberately NOT in that payload -- a data URL per step would make every poll
megabytes, and a caller that wants pixels is asking the wrong interface.

## Wiring it into Redrob Code

`POST /mcp` is an MCP server over the streamable-HTTP transport. Redrob Code is an MCP client, so this is
the path that replaces a browser CLI: you keep typing into `redrob`, and it gains the browser as a tool.

Add it to `redrob.jsonc` (project) or `~/.config/redrob/redrob.jsonc` (global). The remote shape is
`type`, `url`, `headers`, and `enabled`, per `ConfigMCPV1.Remote` in the engine:

```jsonc
{
  "mcp": {
    "browser": {
      "type": "remote",
      "url": "http://127.0.0.1:39645/mcp",
      "headers": { "Authorization": "Bearer <token from redrob-cli.json>" },
      // OAuth auto-detection would try to discover an authorization server that is not there.
      "oauth": false
    }
  }
}
```

The port and credential CHANGE EVERY LAUNCH, which is the awkward part of this and is deliberate -- a
long-lived credential in a config file is a long-lived way to drive someone's logged-in browser. Two ways
to live with it: write the config from `redrob-cli.json` in a shell wrapper before you start the agent, or
run `redrob mcp add` when you begin a session and let it prompt you.

Two tools are exposed, and both go through the same `StartTask` every other surface uses, so an external
caller cannot reach a capability -- or skip a permission gate -- that the agent inside the browser does not
have:

* **`browse`** -- `{prompt, mode?, effort?}`. Runs a task in a real browser with your sessions and logins,
  opening real tabs you can watch and take over. Returns a task id.
* **`browse_status`** -- `{task_id}`. State, trace and answer. `done` is false while it is still working.

`browse` returns rather than blocks because a browsing task is not instantaneous; an agent is expected to
call `browse_status` until `done`.

### What is verified

**End to end with Redrob Code as the client.** The built `redrob` binary was pointed at a running browser
using exactly the `redrob.jsonc` above. `redrob mcp list` reports `✓ browser connected`. An agent turn
(`redrob run --model redrob/claude-opus-5`) then chose the `browse` tool on its own, polled `browse_status`
until `done`, and reported the answer back in the terminal -- while the browser opened a real tab for the
page and recorded the task in its own Chats list, watchable the whole time.

Two things that run showed which are worth knowing:

* **The agent picked `read-only` itself.** Nothing told it to; the default had it been silent would have
  been `guard`. So the mode descriptions in the tool schema are doing their job -- a summarise task got
  the narrowest mode the product has.
* **The permission boundary held against the caller.** The browser's own engine tried `save_file`, was
  refused, and the refusal is in the trace as a step rather than swallowed -- so an external caller
  cannot reach a capability the agent inside the browser does not have, and a person watching can see
  what was attempted.

**The transport, against the reference client's requirements** (`@modelcontextprotocol/sdk`,
`StreamableHTTPClientTransport`): it POSTs `application/json` with
`accept: application/json, text/event-stream`, tolerates a JSON response, treats 405 on the optional `GET`
stream as "not offered", and expects 202 for a notification. Two defects were found by reading it and
fixed -- `GET /mcp` used to answer 404, which the client reports as an error on every connect, and
`notifications/initialized` used to get a JSON-RPC error back, which is a protocol violation. An unknown
method WITH an id still errors rather than being swallowed as a notification.

**The endpoint itself, with an HTTP client**: `/hello` answers unauthenticated, a missing and a wrong
credential are both 401, `tools/list` returns the two tools with their schemas, and the SSE stream carries
a task live through to its answer.
