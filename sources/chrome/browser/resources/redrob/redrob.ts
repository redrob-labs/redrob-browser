// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {
  Effort,
  FollowUpMode,
  FollowUpOutcome,
  PageCallbackRouter,
  PageHandlerFactory,
  PermissionMode,
  StepKind,
  TaskHostRemote,
  TaskState,
} from './redrob.mojom-webui.js';
import type {Step, Task} from './redrob.mojom-webui.js';
import {loadTimeData} from 'chrome://resources/js/load_time_data.js';

// The page talks to the browser process and to nothing else. There is no fetch here and no key here:
// see docs/AI_SURFACE.md. A compromised renderer gets this method surface, not the engine.
const router = new PageCallbackRouter();
const host = new TaskHostRemote();
PageHandlerFactory.getRemote().createTaskHost(
    router.$.bindNewPipeAndPassRemote(), host.$.bindNewPipeAndPassReceiver());

// Rendered state is derived from what the browser process reports, never from what we just sent. A
// card that showed "running" because the page asked for it would be lying about the engine.
const tasks = new Map<string, Task>();

// One document, two views. `?task=<id>` is a task tab; no query is the new tab.
const openTaskId = new URLSearchParams(location.search).get('task');

// The model the composer will start a task with. Empty means the browser's default, which is what every
// task got when #model was one hardcoded option nothing read. Filled by the chooser when it lands.
let chosenModel = '';
// `?ask=<prompt>` is how `redrob "..."` from a terminal arrives: the process singleton forwards the
// command line to the running browser, which opens this surface with the prompt already in it. Started
// here rather than in C++ so there is ONE StartTask path with one set of bounds and one permission gate.
const askedFromCommandLine = new URLSearchParams(location.search).get('ask');

function $<T extends HTMLElement>(id: string): T {
  return document.querySelector<T>(`#${id}`)!;
}

function stateLabel(state: TaskState): string {
  switch (state) {
    case TaskState.kQueued:
      return loadTimeData.getString('taskStateQueued');
    case TaskState.kRunning:
      return loadTimeData.getString('taskStateRunning');
    case TaskState.kBlockedOnPolicy:
      return loadTimeData.getString('taskStateBlocked');
    case TaskState.kSucceeded:
      return loadTimeData.getString('taskStateDone');
    case TaskState.kFailed:
      return loadTimeData.getString('taskStateFailed');
    case TaskState.kCancelled:
      return loadTimeData.getString('taskStateCancelled');
    default:
      return loadTimeData.getString('taskStateUnknown');
  }
}

// One drawn glyph per step kind. These were emoji, which is three problems at once: this build ships no
// colour emoji font, so several fell back to boxes; `⑃`, `⊘`, `↺` and `⋯` are text-presentation glyphs
// that a text font draws at whatever weight it likes, so the row read unevenly; and none of them could
// take the product's own stroke weight. Built as elements rather than markup because this is a WebUI
// under Trusted Types, where assigning innerHTML throws.
//
// Keyed off the mojom enum, not the label: a label match is a string comparison that silently stops
// matching when the wording changes.
type Glyph = Array<[string, Record<string, string>]>;

function stepGlyph(kind: StepKind): Glyph {
  switch (kind) {
    case StepKind.kSearchedMemory:  // a clock, for looking back
      return [['circle', {cx: '8', cy: '8', r: '5.2'}], ['path', {d: 'M8 4.6V8l2.6 1.7'}]];
    case StepKind.kOpenedPage:  // a window
      return [
        ['rect', {x: '2.4', y: '3.2', width: '11.2', height: '9.6', rx: '1.6'}],
        ['path', {d: 'M2.4 6.2h11.2'}],
      ];
    case StepKind.kCapturedScreenshot:  // a camera
      return [
        ['rect', {x: '2.2', y: '4.8', width: '11.6', height: '8', rx: '1.6'}],
        ['circle', {cx: '8', cy: '8.8', r: '2.2'}],
        ['path', {d: 'M6.3 4.8l.9-1.5h1.6l.9 1.5'}],
      ];
    case StepKind.kSavedArtifact:  // a page with a folded corner
      return [
        ['path', {d: 'M4.2 2.8h4.4L12 6.2v7H4.2z'}],
        ['path', {d: 'M8.4 2.8v3.4H12'}],
      ];
    case StepKind.kUsedCredential:  // a key
      return [
        ['circle', {cx: '5.7', cy: '6.3', r: '2.6'}],
        ['path', {d: 'M7.7 8.3l5.1 5.1'}],
        ['path', {d: 'M10.4 11l1.4-1.4'}],
      ];
    case StepKind.kSpawnedSubagents:  // one branching into two
      return [
        ['path', {d: 'M8 2.8v3'}],
        ['path', {d: 'M8 5.8L4.5 9.2v3.2'}],
        ['path', {d: 'M8 5.8l3.5 3.4v3.2'}],
      ];
    case StepKind.kRefused:  // a barred circle
      return [['circle', {cx: '8', cy: '8', r: '5.4'}], ['path', {d: 'M4.6 11.4l6.8-6.8'}]];
    case StepKind.kSteered:  // a turn taken
      return [
        ['path', {d: 'M12.4 8.4A4.6 4.6 0 118 3.8h3.4'}],
        ['path', {d: 'M9.6 2l1.9 1.8-1.9 1.9'}],
      ];
    case StepKind.kQueuedMessage:  // waiting its turn
      return [
        ['circle', {cx: '4.2', cy: '8', r: '1.1', fill: 'currentcolor', stroke: 'none'}],
        ['circle', {cx: '8', cy: '8', r: '1.1', fill: 'currentcolor', stroke: 'none'}],
        ['circle', {cx: '11.8', cy: '8', r: '1.1', fill: 'currentcolor', stroke: 'none'}],
      ];
    case StepKind.kPlanned:  // a list
      return [
        ['path', {d: 'M3.2 4.6h9.6'}],
        ['path', {d: 'M3.2 8h9.6'}],
        ['path', {d: 'M3.2 11.4h6'}],
      ];
    case StepKind.kRoutine:  // a clock with a crown, for something that fires on its own
      return [
        ['circle', {cx: '8', cy: '8.9', r: '4.6'}],
        ['path', {d: 'M8 6.6v2.3l1.7 1.1'}],
        ['path', {d: 'M6.3 2.6h3.4'}],
      ];
    case StepKind.kThinking:
    default:
      return [['circle', {cx: '8', cy: '8', r: '2.4'}]];
  }
}

function stepIcon(kind: StepKind): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  for (const [tag, attrs] of stepGlyph(kind)) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [name, value] of Object.entries(attrs)) {
      node.setAttribute(name, value);
    }
    svg.append(node);
  }
  return svg;
}

function effortLabel(effort: Effort): string {
  switch (effort) {
    case Effort.kQuick:
      return loadTimeData.getString('newTabEffortQuick');
    case Effort.kUltrabrowse:
      return loadTimeData.getString('newTabEffortUltra');
    case Effort.kStandard:
    default:
      return loadTimeData.getString('newTabEffortStandard');
  }
}

function isRunning(task: Task): boolean {
  return task.state === TaskState.kQueued || task.state === TaskState.kRunning;
}

function elapsed(task: Task): string {
  const running = task.state === TaskState.kQueued || task.state === TaskState.kRunning;
  const ms = Date.now() - Number(task.startedAtMs);
  if (!running) {
    const mins = Math.floor(ms / 60000);
    if (mins < 1) {
      return loadTimeData.getString('taskJustNow');
    }
    return mins < 60 ? loadTimeData.getStringF('taskMinutesAgo', mins)
                     : loadTimeData.getStringF('taskHoursAgo', Math.floor(mins / 60));
  }
  const secs = Math.floor(ms / 1000);
  return secs < 60 ? loadTimeData.getStringF('taskWorkingSeconds', secs)
                   : loadTimeData.getStringF('taskWorkingMinutes', Math.floor(secs / 60), secs % 60);
}

function renderStep(step: Step): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'step';

  const head = document.createElement('div');
  head.className = 'step-head';
  const icon = document.createElement('span');
  icon.className = 'step-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.append(stepIcon(step.kind));
  const label = document.createElement('span');
  label.className = 'step-label';
  label.textContent = step.label;
  head.append(icon, label);
  wrap.append(head);

  if (step.details.length > 0) {
    const list = document.createElement('ul');
    list.className = 'step-details';
    for (const detail of step.details) {
      const item = document.createElement('li');
      const text = document.createElement('span');
      text.textContent = detail.text;
      item.append(text);
      if (detail.source) {
        const source = document.createElement('span');
        source.className = 'step-source';
        source.textContent = detail.source;
        item.append(source);
      }
      if (detail.timing) {
        const timing = document.createElement('span');
        timing.className = 'step-timing';
        timing.textContent = detail.timing;
        item.append(timing);
      }
      list.append(item);
    }
    wrap.append(list);
  }

  // A frame the browser captured, handed over as a data URL it produced. The page renders exactly
  // what it is given; it never resolves a path or a token of its own.
  if (step.previewDataUrl) {
    const shot = document.createElement('img');
    shot.className = 'step-shot';
    shot.src = step.previewDataUrl;
    shot.alt = loadTimeData.getStringF('taskCapturedFrame', step.label);
    wrap.append(shot);
  }

  return wrap;
}

// ---------- new tab ----------

// Elapsed labels currently on screen, so a running task's timer advances without a push from the
// browser. Only the text node is rewritten: re-rendering the whole list each second would destroy
// focus, reset scroll and re-decode every card's frame.
const ticking: Array<{task: Task, label: HTMLElement}> = [];
let tickTimer: number|undefined;

function retick() {
  for (const {task, label} of ticking) {
    label.textContent = elapsed(task);
  }
  if (!ticking.some(({task}) => isRunning(task))) {
    // Nothing is running, so nothing will change until the browser pushes. Stop rather than wake the
    // page every second for a list of finished work.
    clearInterval(tickTimer);
    tickTimer = undefined;
  }
}

function renderHome() {
  const list = $<HTMLOListElement>('cards');
  list.textContent = '';
  // The old labels belong to elements this render is about to throw away.
  ticking.length = 0;
  const ordered = [...tasks.values()].sort(
      (a, b) => Number(b.startedAtMs) - Number(a.startedAtMs));

  // Suggested tiles answer an EMPTY state. Once real tasks exist the empty state is over, so the tiles
  // go rather than sit above them -- three prompts we invented should not outrank three the user ran.
  $('suggested').hidden = ordered.length > 0;
  $('recent').hidden = ordered.length === 0;

  for (const task of ordered) {
    const card = document.createElement('li');
    const open = document.createElement('button');
    open.className = 'card-open';
    open.type = 'button';
    open.addEventListener('click', () => {
      // A task opens as a tab, which is the design: the trace is a place you go back to, not a
      // panel that disappears when the composer is used again.
      location.href = `chrome://redrob/?task=${encodeURIComponent(task.id)}`;
    });

    const when = document.createElement('div');
    when.className = 'card-elapsed';
    when.textContent = elapsed(task);
    ticking.push({task, label: when});
    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = task.prompt;
    open.append(when, title);

    const steps = document.createElement('ul');
    steps.className = 'card-steps';
    for (const step of task.steps.slice(-3)) {
      const item = document.createElement('li');
      const icon = document.createElement('span');
      icon.className = 'step-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.append(stepIcon(step.kind));
      const label = document.createElement('span');
      label.className = 'card-step-label';
      label.textContent = step.label;
      item.append(icon, label);
      steps.append(item);
    }
    open.append(steps);
    card.append(open);

    const shot = [...task.steps].reverse().find((s) => s.previewDataUrl);
    if (shot?.previewDataUrl) {
      const img = document.createElement('img');
      img.className = 'card-shot';
      img.src = shot.previewDataUrl;
      img.alt = loadTimeData.getStringF('taskLatestFrame', task.prompt);
      card.append(img);
    }

    list.append(card);
  }

  // Left empty when there are no tasks. The suggested tiles above already answer an empty state, and a
  // sentence on top of them saying it is empty is noise rather than information.
  $('home-status').textContent = '';

  // One timer for the whole list, armed only while something is actually running.
  if (tickTimer === undefined && ordered.some(isRunning)) {
    tickTimer = setInterval(retick, 1000);
  }
}

// ---------- task tab ----------

// Which captured frame the user closed the preview on, if any. Page state rather than a DOM flag,
// because the DOM is rewritten on every push from the browser and a flag set on the element would be
// undone by the next one.
let dismissedFrame: string|null = null;

// What is already drawn, so a push appends instead of rebuilding. The trace only grows, and rebuilding
// it was what re-announced the whole history to a screen reader and destroyed focus inside it.
let renderedSteps = 0;
// Nullable to match the mojom field: a task with no narration yet reports null, not an empty string, and
// conflating the two would redraw on the first push that turned one into the other.
let lastNarration: string|null = null;
let lastState: TaskState|undefined;

function renderTask() {
  const task = openTaskId ? tasks.get(openTaskId) : undefined;
  if (!task) {
    // Not found used to set the title and stop, which left the follow-up form, its permission and
    // folder controls and its send button live against a task that does not exist -- so a reply could
    // be typed and sent to nothing. Everything that acts on a task is taken away with the task.
    $('task-title').textContent = loadTimeData.getString('taskNotFound');
    $('task-state').textContent = '';
    $('task-effort').textContent = '';
    $('reply-model').textContent = '';
    $('task-stop').hidden = true;
    $('narration').textContent = '';
    $('steps').textContent = '';
    $('trace-error').hidden = true;
    $('trace-empty-title').textContent = loadTimeData.getString('taskNotFound');
    $('trace-empty').hidden = false;
    renderedSteps = 0;
    lastNarration = null;
    $('preview').hidden = true;
    $('reply').hidden = true;
    return;
  }
  $('trace-empty').hidden = true;
  $('reply').hidden = false;

  document.title = `${task.prompt} · Redrob`;
  $('task-title').textContent = task.prompt;
  $('task-state').textContent = stateLabel(task.state);
  $('task-effort').textContent =
      task.workingFolder ? `${effortLabel(task.effort)} · ${task.workingFolder}`
                         : effortLabel(task.effort);

  // The model this task ACTUALLY ran on, from the task itself. This span was the literal string
  // "redrob/auto" in the markup, so it kept claiming that id no matter what the task ran on -- and once
  // a model could be chosen, that markup would have been an outright lie rather than a stale default.
  // Empty for tasks started before the field existed, which reads as the default.
  $('reply-model').textContent =
      task.model || loadTimeData.getString('newTabModelDefault');

  // Stop only exists while there is something to stop, and the composer's second button appears with
  // it: interrupting is only a question when the task is mid-run.
  const running = isRunning(task);
  $('task-stop').hidden = !running;
  $('reply-steer').hidden = !running;
  $<HTMLButtonElement>('reply-send').setAttribute(
      'aria-label', running ? loadTimeData.getString('taskQueueReply') : loadTimeData.getString('taskSendReply'));

  const queued = $<HTMLOListElement>('queued');
  queued.textContent = '';
  queued.hidden = task.queued.length === 0;
  task.queued.forEach((pending, index) => {
    const item = document.createElement('li');
    const words = document.createElement('span');
    words.className = 'queued-words';
    words.textContent = pending;
    // Withdraw carries the index AND the text, because the browser refuses the call if the queue has
    // moved since this list was drawn -- the entry may have started running between the render and the
    // click, and deleting by position alone would take back a different message than the one clicked.
    const withdraw = document.createElement('button');
    withdraw.type = 'button';
    withdraw.className = 'queued-withdraw';
    withdraw.setAttribute('aria-label', loadTimeData.getString('taskWithdrawQueued'));
    // Drawn, not a text glyph: this bundle has no emoji font and a literal x renders at whatever weight
    // the text font feels like, which is the problem the step icons already had.
    const mark = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    mark.setAttribute('viewBox', '0 0 16 16');
    mark.setAttribute('aria-hidden', 'true');
    for (const d of ['M5 5l6 6', 'M11 5l-6 6']) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      line.setAttribute('d', d);
      mark.append(line);
    }
    withdraw.append(mark);
    withdraw.addEventListener('click', async () => {
      withdraw.disabled = true;
      const {withdrawn} = await host.withdrawQueuedFollowUp(openTaskId!, index, pending);
      if (!withdrawn) {
        // Nothing was deleted. Say so rather than leaving a dead click, and let the next OnTaskChanged
        // redraw the list as it really is.
        $('task-status').textContent = loadTimeData.getString('taskWithdrawFailed');
        withdraw.disabled = false;
      }
    });
    item.append(words, withdraw);
    queued.append(item);
  });
  paintModeSelects(task.mode);

  const trace = $('trace');
  // Whether the user was already reading the newest part. A live task appends to the bottom, and
  // yanking the view down while someone is reading further up is worse than letting them scroll.
  const wasAtBottom =
      trace.scrollHeight - trace.scrollTop - trace.clientHeight < 40;

  // Narration is one string the browser rewrites, so it is replaced only when it actually changed --
  // rewriting identical paragraphs on every push is what destroyed focus and re-announced the log.
  const narration = $('narration');
  if (task.narration !== lastNarration) {
    lastNarration = task.narration;
    narration.textContent = '';
    if (task.narration) {
      // One paragraph per turn. The browser separates turns with a blank line, so a steered task reads
      // as an answer, an instruction and then a different answer.
      for (const paragraph of task.narration.split('\n\n')) {
        if (!paragraph) {
          continue;
        }
        const prose = document.createElement('p');
        prose.className = 'narration';
        prose.textContent = paragraph;
        narration.append(prose);
      }
    }
  }

  // Steps only ever grow, so only the new ones are built. A step already on screen is left alone,
  // which is what keeps focus and selection inside it alive.
  const steps = $('steps');
  const fresh: HTMLElement[] = [];
  for (const step of task.steps.slice(renderedSteps)) {
    const element = renderStep(step);
    fresh.push(element);
    steps.append(element);
  }
  renderedSteps = task.steps.length;

  const error = $('trace-error');
  error.textContent = task.error ?? '';
  error.hidden = !task.error;

  // One short announcement per change instead of the whole history: the newest step if a step arrived,
  // otherwise the state if only that moved.
  const newest = task.steps[task.steps.length - 1];
  if (fresh.length > 0 && newest) {
    $('announce').textContent = newest.label;
  } else if (task.state !== lastState) {
    $('announce').textContent = stateLabel(task.state);
  }
  lastState = task.state;

  if (wasAtBottom) {
    // Twice, and then again per image. A captured frame arrives as a data URL that has not been
    // decoded yet, so its box grows AFTER this function returns -- scrolling only here left the view
    // sitting near the top of a trace that had just got taller, which is how the steer and queue steps
    // ended up off-screen.
    const stick = () => {
      trace.scrollTop = trace.scrollHeight;
    };
    stick();
    requestAnimationFrame(stick);
    // Only the images just appended: the ones already on screen have decoded, and re-listening to them
    // on every push added a listener per push per image.
    for (const element of fresh) {
      for (const image of element.querySelectorAll('img')) {
        image.addEventListener('load', stick, {once: true});
      }
    }
  }

  // The preview beside the trace is the newest frame the browser captured. A real embedded view of
  // the agent's tab is a guest view and is deliberately later work -- see docs/UI.md step 8.
  const latest = [...task.steps].reverse().find((s) => s.previewDataUrl);
  const preview = $('preview');
  if (latest?.previewDataUrl) {
    // Closing it used to last until the next push from the browser -- which is every few seconds on a
    // running task, because this function set `hidden = false` unconditionally whenever a frame existed.
    // The dismissal is remembered against the FRAME it dismissed, so a re-render leaves it closed and a
    // genuinely new capture opens it again. Keyed on the data URL because that is the frame's identity:
    // the steps array is rebuilt on every push, so an index would not survive.
    if (dismissedFrame === latest.previewDataUrl) {
      preview.hidden = true;
    } else {
      $<HTMLImageElement>('preview-image').src = latest.previewDataUrl;
      $<HTMLImageElement>('preview-image').alt = loadTimeData.getStringF('taskCapturedFrame', latest.label);
      $('preview-title').textContent = latest.label;
      preview.hidden = false;
    }
  } else {
    preview.hidden = true;
  }
}

function render() {
  if (openTaskId) {
    renderTask();
  } else {
    renderHome();
  }
}

// ---------- wiring ----------

router.onTaskChanged.addListener((task: Task) => {
  tasks.set(task.id, task);
  render();
});

// A URL typed on its own is a navigation, not a task. Nothing else in a browser treats it otherwise, and the
// composer replaced the omnibox on this page -- so before this, typing an address and pressing Enter filed it
// as work for the agent and the address was never opened. It was found by a test that typed two URLs to visit
// two pages: both became tasks and neither page was ever loaded.
//
// The boundary is WHITESPACE, and it is doing real work rather than only guarding the parse. A URL alone is an
// address. A URL with words around it -- "summarise https://example.com/pricing" -- is an instruction that
// happens to contain an address, and stays a task. That is a rule a user can predict without being taught it.
//
// Only http and https. A text field that navigates to whatever scheme it is handed is a way to reach
// javascript:, file: and chrome: from typed input, so the scheme is ALLOW-LISTED rather than merely inspected.
const kNavigableSchemes = ['http:', 'https:'];

// Labels joined by dots, optional port and path, and a final label of at least two letters -- so "e.g." and
// "etc." stay prose rather than becoming hostnames.
const kBareHost =
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}(:\d{1,5})?(\/\S*)?$/i;
// Loopback has no dotted TLD, so it needs its own rule -- and it is the case a developer types most.
const kLoopback = /^(localhost|127(\.\d{1,3}){3}|\[::1\])(:\d{1,5})?(\/\S*)?$/i;

function navigationTarget(input: string): string|null {
  const text = input.trim();
  if (!text || /\s/.test(text)) {
    return null;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) {
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      return null;
    }
    return kNavigableSchemes.includes(url.protocol) ? url.href : null;
  }
  // https for a public host, http for loopback: guessing https for 127.0.0.1 fails on every local dev server.
  if (kBareHost.test(text)) {
    return `https://${text}`;
  }
  if (kLoopback.test(text)) {
    return `http://${text}`;
  }
  return null;
}

// The mode a NEW task starts in. Guard, not full access: the narrowest posture that can still do the
// job is the right default, and widening is a decision the user makes deliberately.
let composerMode: PermissionMode = PermissionMode.kGuard;

// Which of the two segments is selected: does what you type go to the web, or to the agent?
//
// Distinct from `composerMode` above, which is the PERMISSION a task runs under (read / guard / full). Two
// different questions that both used to be called a mode, only one of which the pill was about.
//
// Defaults to 'ask', matching the class the markup ships with -- this is an agent browser, and the new tab's
// field is primarily where work is handed over.
type Intent = 'search'|'ask';
let intent: Intent = 'ask';

const MODES: Record<string, PermissionMode> = {
  read: PermissionMode.kReadOnly,
  guard: PermissionMode.kGuard,
  full: PermissionMode.kFullAccess,
};

// A <select> is laid out at the width of its WIDEST option, so "Guard" occupied the width of "Full
// access" and left a hole before the chevron. Each control draws its value as ordinary text and hides the
// real select on top of it, so this keeps the width honest and the native popup and keyboard intact.
function syncSelectLabel(select: HTMLSelectElement) {
  const value = select.parentElement?.querySelector<HTMLElement>('.ctl-value');
  if (value) {
    value.textContent = select.selectedOptions[0]?.textContent ?? '';
  }
}

function bindSelectLabels() {
  for (const select of document.querySelectorAll<HTMLSelectElement>('.ctl-select select')) {
    select.addEventListener('change', () => syncSelectLabel(select));
    syncSelectLabel(select);
  }
}

// Scoped to the visible view. Both composers carry the same control, so addressing it by id meant every
// lookup found the home form's copy and the task tab's did nothing at all.
function modeSelects(): HTMLSelectElement[] {
  const root = openTaskId ? $('task') : $('home');
  return [...root.querySelectorAll<HTMLSelectElement>('[data-mode-select]')];
}

// The model chooser is the NATIVE select it always was, filled from what the engine says this machine
// can route to. The reference builds a full modal here -- facet groups for price band, capability and
// vendor, a sortable table, a token-wise search -- and that is right for its several hundred models. This
// list is what ONE machine has configured, which is a handful: the stub answers with three. A faceted
// table over three rows would be furniture, and a native select already brings the parts that actually
// matter at this size -- type-ahead, keyboard, touch and screen-reader semantics -- which is the same
// reason this control was kept native when its focus ring was fixed. <optgroup> gives the grouping by
// provider that the reference gets from section headers. If a console catalogue ever lands here and the
// list grows by two orders of magnitude, THAT is when the modal earns its place.
async function fillModelSelect() {
  const select = $<HTMLSelectElement>('model');
  const {options} = await host.listModels();
  if (!options.length) {
    // No engine, which is the ordinary state on a machine that never installed one. Say that on the
    // control rather than leaving the hardcoded id sitting there looking like a choice, and keep the
    // default working: an empty chosenModel is exactly what the browser already sends.
    select.textContent = '';
    const only = document.createElement('option');
    only.value = '';
    only.textContent = loadTimeData.getString('newTabModelDefault');
    select.append(only);
    chosenModel = '';
    syncSelectLabel(select);
    return;
  }

  // `auto` first, then provider groups in the order the engine listed them. Auto is not just another
  // row: it is the one entry that means "let the router decide", so burying it alphabetically among
  // model names would hide the default.
  select.textContent = '';
  const auto = options.filter((option) => option.id.endsWith('/auto'));
  const rest = options.filter((option) => !option.id.endsWith('/auto'));
  const addOption = (id: string, label: string, parent: HTMLElement) => {
    const element = document.createElement('option');
    element.value = id;
    element.textContent = label;
    parent.append(element);
  };
  for (const option of auto) {
    addOption(option.id, option.id, select);
  }
  const groups = new Map<string, typeof rest>();
  for (const option of rest) {
    const list = groups.get(option.providerId) ?? [];
    list.push(option);
    groups.set(option.providerId, list);
  }
  for (const [providerId, list] of groups) {
    const group = document.createElement('optgroup');
    group.label = providerId;
    for (const option of list) {
      // Name plus the band when the engine priced it, because "premium" is the fact a person choosing
      // between two models of the same family actually wants.
      addOption(option.id, option.priceBand ? `${option.name} · ${option.priceBand}` : option.name,
                group);
    }
    select.append(group);
  }
  // Keep whatever was already chosen if the engine still offers it; otherwise fall back to the default
  // rather than silently running on a model the user did not pick.
  const available = options.some((option) => option.id === chosenModel);
  chosenModel = available ? chosenModel : (auto[0]?.id ?? '');
  select.value = chosenModel;
  syncSelectLabel(select);
}

function paintModeSelects(current: PermissionMode) {
  const name = Object.keys(MODES).find((key) => MODES[key] === current) ?? 'guard';
  for (const select of modeSelects()) {
    select.value = name;
    // Setting .value in script fires no change event, so the drawn label has to be told.
    syncSelectLabel(select);
  }
}

// On the home composer the mode is just picked. On a task tab it is a REQUEST: the browser refuses to
// widen a task that is already running, so the control is repainted from what it accepted rather than
// from what was chosen. A select left showing a mode the task was refused is worse than a failed click,
// because it keeps claiming the task has access it does not.
function bindModeSelects(taskId: string|null) {
  for (const select of modeSelects()) {
    select.addEventListener('change', async () => {
      const mode = MODES[select.value];
      if (mode === undefined) {
        return;
      }
      if (!taskId) {
        composerMode = mode;
        return;
      }
      const {accepted} = await host.setPermissionMode(taskId, mode);
      if (!accepted) {
        $('task-status').textContent =
            loadTimeData.getString('taskNoMoreAccess');
      }
      const task = tasks.get(taskId);
      paintModeSelects(task ? task.mode : composerMode);
    });
  }
  paintModeSelects(composerMode);
}

bindSelectLabels();

if (openTaskId) {
  $('task').hidden = false;
  bindModeSelects(openTaskId);

  $<HTMLButtonElement>('task-stop').addEventListener('click', () => {
    host.cancelTask(openTaskId);
  });

  $<HTMLButtonElement>('pick-folder').addEventListener('click', async () => {
    const {displayPath} = await host.chooseWorkingFolder(openTaskId);
    $('task-status').textContent = displayPath
        ? loadTimeData.getStringF('taskFilesGoIn', displayPath)
        : loadTimeData.getString('taskNoFolderChosen');
  });

  const send = async (mode: FollowUpMode) => {
    const field = $<HTMLInputElement>('reply-prompt');
    const prompt = field.value.trim();
    if (!prompt) {
      return;
    }
    const {outcome} = await host.sendFollowUp(openTaskId, prompt, mode);
    if (outcome === FollowUpOutcome.kRejected) {
      $('task-status').textContent =
          loadTimeData.getString('taskReplyRejected');
      return;
    }
    field.value = '';
    // Said plainly, because "queued" and "interrupted" are genuinely different things to have just
    // done and the trace will show them differently too.
    switch (outcome) {
      case FollowUpOutcome.kInterrupted:
        $('task-status').textContent = loadTimeData.getString('taskSteered');
        break;
      case FollowUpOutcome.kQueued:
        $('task-status').textContent = loadTimeData.getString('taskReplyQueued');
        break;
      default:
        $('task-status').textContent = loadTimeData.getString('taskReplySent');
        break;
    }
  };

  // Enter queues. It is the safe one, and the destructive alternative is a button you have to mean.
  $<HTMLFormElement>('reply').addEventListener('submit', (event: Event) => {
    event.preventDefault();
    void send(FollowUpMode.kAuto);
  });
  $<HTMLButtonElement>('reply-steer').addEventListener('click', () => {
    void send(FollowUpMode.kInterrupt);
  });
  $<HTMLButtonElement>('preview-close').addEventListener('click', () => {
    // Remember WHICH frame was dismissed, not merely that the panel was closed, so the next capture
    // still earns the panel back.
    dismissedFrame = $<HTMLImageElement>('preview-image').src || null;
    $('preview').hidden = true;
  });

  const {task} = await host.getTask(openTaskId);
  if (task) {
    tasks.set(task.id, task);
  }
  render();
} else {
  $('home').hidden = false;
  bindModeSelects(null);

  // The reason this surface exists is to be typed into.
  $<HTMLInputElement>('prompt').focus();

  // Filled from the engine rather than left as the one hardcoded id. Deliberately not awaited: the
  // composer must be usable the instant the page draws, and the chooser arriving a moment later changes
  // nothing about a task started with the default.
  void fillModelSelect();
  $<HTMLSelectElement>('model').addEventListener('change', () => {
    chosenModel = $<HTMLSelectElement>('model').value;
  });

  for (const tile of document.querySelectorAll<HTMLElement>('.tile')) {
    tile.addEventListener('click', () => {
      const field = $<HTMLInputElement>('prompt');
      field.value = tile.dataset['prompt'] ?? '';
      field.focus();
    });
  }

  // Search is the browser's job, not the agent's. Handing the omnibox the query keeps one search
  // path in the product rather than a second one that only works on this page.
  //
  // Both segments now only SELECT a mode; submitting is what acts. That is what makes the pill honest --
  // `seg-on` moves, so the control reports the mode it is actually in -- and it also puts the keyboard and
  // the buttons on the same rule, where before Enter filed a task no matter which segment looked selected.
  const paintIntent = () => {
    const search = $<HTMLButtonElement>('mode-search');
    const ask = $<HTMLButtonElement>('mode-ask');
    search.classList.toggle('seg-on', intent === 'search');
    ask.classList.toggle('seg-on', intent === 'ask');
    search.setAttribute('aria-pressed', String(intent === 'search'));
    ask.setAttribute('aria-pressed', String(intent === 'ask'));
    // The placeholder follows the mode. Leaving "Ask AI a task, @ for context" under a selected Search
    // segment would be the same class of lie the static seg-on was.
    $<HTMLInputElement>('prompt').placeholder = loadTimeData.getString(
        intent === 'search' ? 'newTabPromptPlaceholderSearch' : 'newTabPromptPlaceholder');
  };

  const setIntent = (next: Intent) => {
    intent = next;
    paintIntent();
    // Focus returns to the field, because selecting a mode is never the goal -- typing is.
    $<HTMLInputElement>('prompt').focus();
  };

  $<HTMLButtonElement>('mode-search').addEventListener(
      'click', () => setIntent('search'));
  $<HTMLButtonElement>('mode-ask').addEventListener('click', () => setIntent('ask'));
  paintIntent();

  $<HTMLFormElement>('composer').addEventListener('submit', async (event: Event) => {
    event.preventDefault();
    const field = $<HTMLInputElement>('prompt');
    const prompt = field.value.trim();
    if (!prompt) {
      return;
    }
    // Before anything else: an address is OPENED, not filed as work. This runs in either mode, because
    // searching the web for a URL the user has already typed in full is never what was meant, and neither is
    // handing it to an agent as a task.
    const target = navigationTarget(prompt);
    if (target) {
      field.value = '';
      location.href = target;
      return;
    }
    // Search mode stops here. The segment now governs Enter as well as the click, which it never did while
    // `Ask AI` was the form's submit button.
    //
    // The browser performs the navigation with the profile's DEFAULT search provider. This used to build
    // `https://www.google.com/search?q=` here, which meant choosing another engine in settings changed
    // nothing about what this field did -- our own surface quietly overrode the user's choice. The page
    // cannot do better on its own: the provider's template owns the query parameter and its encoding, so
    // the side holding the template has to build the URL.
    if (intent === 'search') {
      field.value = '';
      host.searchWithDefaultProvider(prompt);
      return;
    }
    const chosen = $<HTMLSelectElement>('effort').value;
    const effort = chosen === 'ultra' ? Effort.kUltrabrowse
                 : chosen === 'quick' ? Effort.kQuick
                                      : Effort.kStandard;
    // Context refs are opaque handles the browser resolves. None are collected yet -- the `@` picker
    // is later work -- and sending a URL here instead would be exactly the shortcut the design forbids.
    const {taskId, error} = await host.startTask(prompt, [], composerMode, effort, chosenModel);
    if (error !== null && error !== undefined) {
      $('home-status').textContent =
          loadTimeData.getString('taskEngineUnavailable');
      return;
    }
    field.value = '';
    if (taskId) {
      location.href = `chrome://redrob/?task=${encodeURIComponent(taskId)}`;
    }
  });

  const {tasks: existing} = await host.listTasks();
  for (const task of existing) {
    tasks.set(task.id, task);
  }
  render();

  // A task that came from the command line runs at Guard and Standard: the terminal cannot say
  // otherwise, and a switch that silently granted more than the composer's own default would be the
  // widest permission in the product hiding in the narrowest-looking place.
  if (askedFromCommandLine) {
    const {taskId, error} = await host.startTask(
        // Empty model for the same reason as Guard and Standard: the terminal cannot express a choice,
        // so it takes the product's default rather than whatever this tab's chooser was last set to.
        askedFromCommandLine, [], PermissionMode.kGuard, Effort.kStandard, '');
    if (error !== null && error !== undefined) {
      $('home-status').textContent =
          loadTimeData.getString('taskCommandUnavailable');
    } else if (taskId) {
      // Replaced, not pushed: the prompt should not stay in this tab's URL, and Back should not re-run
      // the task.
      location.replace(`chrome://redrob/?task=${encodeURIComponent(taskId)}`);
    }
  }
}
