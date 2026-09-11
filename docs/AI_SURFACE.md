# `chrome://redrob` and the sidecar

`docs/UI.md` decides *where* each part of the product lives and in what order to build it. This is
step 3 of that order, at the level of files and interfaces: the AI surface as a WebUI page, and the
model behind it as a separate local process rather than code inside the browser.

Nothing here is built yet. It is written down first because the expensive mistake in this layer is
structural — putting inference, keys or tool execution in the browser process — and that mistake is
cheap to avoid on paper and very expensive to undo after the release train starts.

## The shape

```
  chrome://redrob  (Blink, HTML/CSS/TS)          ← the product: composer, task cards, @ picker
        │  Mojo: redrob.mojom.TaskHost
  browser process  (C++, thin)                   ← lifecycle, credentials, policy gate
        │  loopback HTTP + Basic auth, 127.0.0.1 only
  Redrob Code sidecar  (separate process)        ← inference, model routing, tool calls
```

Three properties fall out of that split, and each of them is the reason for it:

- **The browser ships no inference code, no API key handling and no model updates.** Those would
  otherwise be tied to Chromium's four-week release train. Office already runs this exact arrangement
  in production, so this is reuse rather than design.
- **The page cannot reach the network or the key.** The renderer talks Mojo to the browser process and
  nothing else; the browser process holds the sidecar's generated credentials and the port. A
  compromised renderer gets the interface's method surface, not `REDROB_API_KEY`.
- **No debugging port is opened.** Driving agent tabs goes through browser-process plumbing (step 4),
  not `--remote-debugging-port`, which would expose full browser control to anything on loopback.

## What has to be added to Chromium

Six touch points. Four are ours outright and live in this repository; two are genuine modifications of
Chromium files and therefore patches.

### Ours (new files, copied into the checkout by the build)

| Path in the checkout | What it is |
| --- | --- |
| `chrome/browser/resources/redrob/` | The page: `redrob.html`, `redrob.ts`, `composer.ts`, `task_card.ts`, `BUILD.gn`. Web technology, iterating at the Console app's speed. |
| `chrome/browser/ui/webui/redrob/redrob_ui.{h,cc}` | `WebUIController` + `WebUIConfig`. Serves the resource bundle, binds the Mojo interface. |
| `chrome/browser/ui/webui/redrob/task_host_impl.{h,cc}` | The Mojo implementation. Owns the sidecar client; never runs a model itself. |
| `chrome/browser/redrob/sidecar_client.{h,cc}` | Sidecar lifecycle and the loopback HTTP calls. |
| `chrome/browser/redrob/redrob.mojom` | The interface below. |

New files are not patches — `patches/README.md` is explicit about that. They need the same delivery
mechanism the branding assets got: rows in a manifest that `redrob.py` copies into the checkout.
`branding/manifest` handles single files; a source tree needs a directory rule, which is the one
extension to `redrob.py` this step requires.

### Chromium's (patches)

| File | Change | Cost |
| --- | --- | --- |
| `chrome/common/webui_url_constants.h` | `inline constexpr char kChromeUIRedrobHost[] = "redrob";` next to `kChromeUIVersionHost` at line 360. | 1 line |
| `chrome/browser/ui/webui/chrome_web_ui_configs.cc` | `map.AddWebUIConfig(std::make_unique<RedrobUIConfig>());` next to `VersionUIConfig` at line 318. | 1 line |

Two one-line patches in files whose surrounding code is a list. That is the cheapest possible patch
shape and it is why the AI surface survives version bumps: `ls patches/` gains two entries, both
mechanical, neither inside a function body.

`chrome_web_ui_controller_factory.cc` needs nothing — the `WebUIConfig` path replaced the factory
`if`-chain for new pages, and only the favicon hook still lives there.

## The Mojo interface

Deliberately small: it is a boundary, not a convenience wrapper. Everything expensive is on the
sidecar's side of it.

```mojom
module redrob.mojom;

// One agent task, as the page needs to render it.
struct Task {
  string id;
  string prompt;
  TaskState state;
  array<Step> steps;
};

enum TaskState { kQueued, kRunning, kBlockedOnPolicy, kSucceeded, kFailed, kCancelled };

struct Step {
  string label;              // "Read redrob.io/pricing"
  string? screenshot_token;  // resolved by the browser process, never a file path
  int64 started_at_ms;
};

// Implemented in the browser process. Bound per WebUI document.
interface TaskHost {
  // Model routing and the policy gate are the sidecar's, not the page's, so the page states intent
  // and receives a decision rather than choosing a model.
  StartTask(string prompt, array<string> context_refs) => (string task_id, StartError? error);
  CancelTask(string task_id);
  ListTasks() => (array<Task> tasks);
  // Streaming, because a task card updates step by step.
  Observe(pending_remote<TaskObserver> observer);
  // `Local` and `Guard` in the mock are these two, and they are sidecar policy, not browser features.
  SetRouting(RoutingMode mode) => (bool accepted);
};

interface TaskObserver {
  OnTaskChanged(Task task);
  OnPolicyPrompt(string task_id, string question) => (bool allowed);
};
```

`context_refs` are opaque handles the browser process resolves (a tab, a selection, a bookmark), not
URLs or paths the renderer hands over. `screenshot_token` is the same idea: a renderer that asks for
`/etc/passwd` gets a rejected token rather than a file.

## Sidecar lifecycle

Copied from Office's transport, which is already hardened for this:

1. **Bind a free loopback port.** `127.0.0.1` only; `localhost` and `::1` accepted as test seams and
   nothing else routable.
2. **Generate Basic credentials per launch.** They live in the browser process for the process's
   lifetime and are never sent to the renderer.
3. **Pass `REDROB_API_KEY` in the child environment only.** Not on a command line, where it would be
   visible in `ps`, and not in a config file the renderer's sandbox escape could read.
4. **Isolate the sidecar's storage.** A temporary `XDG_*`/data path per profile, so a browser profile
   and an Office session cannot see each other's sessions.
5. **Wait for the startup line, then poll `GET /global/health`.** Both, because the line proves the
   process started and health proves it is serving.
6. **Reuse or restart on key fingerprint.** A changed key means a restart; an unchanged one reuses the
   running process.
7. **Requests go to `POST /experimental/external/chat/completions`.** The sidecar owns inference and
   emits tool calls; the browser executes the tools it is willing to execute and sends results back.
   That last clause is the security boundary — the sidecar proposes, the browser decides.

The engine binary itself is not built here. Work packages Redrob Code as a downloaded sidecar and that
is the pattern to follow: the browser's release cycle must not contain the engine's.

## What this does not decide

- **Agent tabs** (step 4). The interface above deliberately has no tab-driving method; that plumbing
  arrives with the tab group and will extend `TaskHost`, not the page.
- **The vertical sidebar** (step 5), which is C++ Views and the most expensive patch in the plan.
- **Where task history is stored.** The sidecar has a session database already; a second store in the
  browser profile would be a synchronisation problem nobody asked for. Default to the sidecar's.
