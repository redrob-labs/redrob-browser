# Where each part of the interface lives

The design has a left sidebar with a workspace switcher, bookmarks and a tab list that includes an
"Agent tabs" group; a top omnibox; and a content area whose empty state is an AI task composer
("Ask AI a task, @ for context") with `Local` and `Guard` controls, over a row of "Recent tasks" cards
showing an agent working, step by step, with screenshots.

A fork has three places to put that, and they cost wildly different amounts. Putting a piece in the wrong
one is how a fork becomes unmaintainable.

## 1. WebUI — a page served by the browser, written in web technology

**Everything AI-facing belongs here.** The task composer, the `Recent tasks` cards, task history, the
`@` context picker, settings for model routing. Registered as `chrome://redrob` and rendered by Blink,
so it is HTML/CSS/TS and iterates at the speed the Console app does. The C++ cost is the registration
and the Mojo interface it calls -- a handful of files, and they change rarely.

This is the layer that carries the product, and it is why the base swap does not cost us the AI work:
the surfaces are web technology on Firefox and on Chromium alike.

## 2. C++ browser UI — `chrome/browser/ui/views`

Two things genuinely need it, and they are the fork's real patch surface:

- **The vertical sidebar and its tab list.** Chromium's tab strip is horizontal and lives in C++ Views;
  a vertical strip is not upstream and every browser that has one (Edge, Vivaldi, Arc) implemented it
  themselves. This is the biggest single patch in the plan and should be scoped on its own.
- **The agent tab group.** Tabs that an agent owns need to exist as real tabs -- so that sites behave,
  extensions load and logins are the user's -- while being visually separated and driven programmatically
  without opening a remote debugging port to the world. That is browser-process plumbing, not a page.

The workspace switcher is a smaller question: Chromium's saved tab groups already carry most of the
model, so the first version should sit on top of them rather than inventing a parallel concept.

## 3. A local sidecar process — the model and the policy

`Local` and `Guard` are not browser features. They are model routing and a policy gate, and Redrob
already has this exact shape shipping in Office: the app talks to a local Redrob Code process over
loopback at `/experimental/external/chat/completions`, which owns inference and tool calls while the app
owns the UI and the tool execution. Reuse it. The browser then needs no inference code, no key handling
and no model updates in its release cycle -- the three things that would otherwise tie the AI roadmap to
Chromium's four-week train.

## The order that keeps the fork cheap

1. A build that launches, unbranded. (This scaffold.)
2. Branding: name, icons, user agent. A handful of patches, and the first real exercise of `export`.
3. `chrome://redrob` with the composer and the task cards, talking to the sidecar. No engine work, and
   most of the product visible.
4. Agent tabs, as plumbing plus a plain tab group.
5. The vertical sidebar and tab strip, last, because it is the most expensive patch and the easiest to
   get wrong before the rest of the product exists.

Zen gave the previous fork spaces, split view and compact mode for free because Firefox's chrome is
JavaScript. None of that comes across. Re-earn them from usage data rather than from the old feature
list -- the two of them we actually miss are worth building, and the rest were free rather than chosen.
