# Where each part of the interface lives

The design has a left sidebar with a workspace switcher, bookmarks and a tab list that includes an
"Agent tabs" group; a top omnibox; a new tab whose content is an AI task composer ("Ask AI a task,
@ for context") with `Local` and `Guard` controls and a model picker, over a row of "Recent tasks"
cards showing an agent working step by step with screenshots; and a task that opens **as a tab**,
showing the agent's trace inline with a live page preview beside it and a reply composer at the foot.

A fork has three places to put that, and they cost wildly different amounts. Putting a piece in the
wrong one is how a fork becomes unmaintainable.

## 1. WebUI — a page served by the browser, written in web technology

**Everything AI-facing belongs here.** The composer, the `Recent tasks` cards, the task tab view, task
history, the `@` context picker, settings for model routing. Registered under the `redrob` WebUI host
and rendered by Blink, so it is HTML/CSS/TS and iterates at the speed the Console app does. The C++
cost is the registration and the Mojo interface it calls -- a handful of files, and they change rarely.

**`chrome://redrob` is the host, not the product.** The composer is reached by opening a new tab,
because `NewTabURLDetails::ForProfile` in `chrome/browser/search/search.cc` is patched to return it.
Typing the URL is what the unwired state looks like; if a reader has to type it, the NTP patch is
missing. Off-the-record windows keep Chromium's incognito NTP on purpose: an agent surface that offered
to run tasks in a window whose whole promise is leaving no trace would be lying about which it is.

This is the layer that carries the product, and it is why the base swap does not cost us the AI work:
the surfaces are web technology on Firefox and on Chromium alike.

## 2. C++ browser UI — `chrome/browser/ui/views`

**The vertical sidebar is upstream now. This section used to say it was the fork's biggest patch and
that was wrong.** Chromium 153 ships the whole thing in
`chrome/browser/ui/views/tabs/vertical/` -- strip containers, scroll bar, expand-on-hover, focus swipe
-- with IPH tutorials and an `about_flags` entry. It is gated, not absent:

```
chrome/browser/ui/tabs/features.cc     BASE_FEATURE(kVerticalTabs, ...)   the capability
chrome/common/pref_names.h             "vertical_tabs.enabled"            per profile
```

So the sidebar costs two one-line default flips, and the plan below is ordered accordingly. The earlier
ordering deferred it as the most expensive item and built the page first; that was a mistake founded on
a stale fact about upstream, and it produced a `chrome://redrob` you had to type a URL to see.

What still genuinely needs C++:

- **The workspace switcher and the bookmarks section** at the top of the sidebar. Chromium's saved tab
  groups already carry most of the workspace model, so the first version should sit on top of them
  rather than inventing a parallel concept.
- **The agent tab group.** Tabs an agent owns need to exist as real tabs -- so sites behave, extensions
  load and logins are the user's -- while being visually separated and driven programmatically without
  opening a remote debugging port to the world. That is browser-process plumbing, not a page.
- **The live page preview** beside a task's trace. A real embedded view of another tab is a guest view;
  until that is wired, the trace shows the frames the browser captured, which is most of the design's
  value and none of its cost.

## 3. A local sidecar process — the model and the policy

`Local` and `Guard` are not browser features. They are model routing and a policy gate, and Redrob
already has this exact shape shipping in Office: the app talks to a local Redrob Code process over
loopback at `/experimental/external/chat/completions`, which owns inference and tool calls while the app
owns the UI and the tool execution. Reuse it. The browser then needs no inference code, no key handling
and no model updates in its release cycle -- the three things that would otherwise tie the AI roadmap to
Chromium's four-week train.

## The order that keeps the fork cheap

1. A build that launches, unbranded. **Done.**
2. Branding: name, icons, user agent. **Done** -- three patches and 44 asset overlays.
3. The Mojo boundary and the sidecar handshake. **Done** -- `TaskHost`, startup line, health poll.
4. **The shell, before more page.** Vertical sidebar on by default, and the new tab becomes the
   composer. Two default flips and one NTP patch, and the product's shape is on screen.
5. The task tab view: a task opens as a tab with its trace, captured frames and a reply composer.
   WebUI, so no C++ beyond what step 3 already built.
6. Agent tabs, as plumbing plus a plain tab group.
7. The workspace switcher, on saved tab groups.
8. The live guest-view preview, last, because captured frames cover the design until it exists.

Zen gave the previous fork spaces, split view and compact mode for free because Firefox's chrome is
JavaScript. None of that comes across. Re-earn them from usage data rather than from the old feature
list -- the two of them we actually miss are worth building, and the rest were free rather than chosen.
