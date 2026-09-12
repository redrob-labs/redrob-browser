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
      return 'queued';
    case TaskState.kRunning:
      return 'running';
    case TaskState.kBlockedOnPolicy:
      return 'blocked';
    case TaskState.kSucceeded:
      return 'done';
    case TaskState.kFailed:
      return 'failed';
    case TaskState.kCancelled:
      return 'cancelled';
    default:
      return 'unknown';
  }
}

// The icon comes from the step's kind, which is a mojom enum, rather than from matching its label.
// A label match is a string comparison that silently stops matching when the wording changes.
function stepIcon(kind: StepKind): string {
  switch (kind) {
    case StepKind.kSearchedMemory:
      return '🕘';
    case StepKind.kOpenedPage:
      return '🗔';
    case StepKind.kCapturedScreenshot:
      return '📷';
    case StepKind.kSavedArtifact:
      return '🗎';
    case StepKind.kUsedCredential:
      return '🔑';
    case StepKind.kSpawnedSubagents:
      return '⑃';
    case StepKind.kRefused:
      return '⊘';
    case StepKind.kSteered:
      return '↺';
    case StepKind.kQueuedMessage:
      return '⋯';
    case StepKind.kPlanned:
      return '☰';
    case StepKind.kRoutine:
      return '⏱';
    case StepKind.kThinking:
    default:
      return '•';
  }
}

function effortLabel(effort: Effort): string {
  switch (effort) {
    case Effort.kQuick:
      return 'Quick';
    case Effort.kUltrabrowse:
      return 'Ultrabrowse';
    case Effort.kStandard:
    default:
      return 'Standard';
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
      return 'just now';
    }
    return mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;
  }
  const secs = Math.floor(ms / 1000);
  return secs < 60 ? `Working for ${secs}s`
                   : `Working for ${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function renderStep(step: Step): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'step';

  const head = document.createElement('div');
  head.className = 'step-head';
  const icon = document.createElement('span');
  icon.className = 'step-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = stepIcon(step.kind);
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
    shot.alt = `Captured frame: ${step.label}`;
    wrap.append(shot);
  }

  return wrap;
}

// ---------- new tab ----------

function renderHome() {
  const list = $<HTMLOListElement>('cards');
  list.textContent = '';
  const ordered = [...tasks.values()].sort(
      (a, b) => Number(b.startedAtMs) - Number(a.startedAtMs));

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
    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = task.prompt;
    open.append(when, title);

    const steps = document.createElement('ul');
    steps.className = 'card-steps';
    for (const step of task.steps.slice(-3)) {
      const item = document.createElement('li');
      const icon = document.createElement('span');
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = stepIcon(step.kind);
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
      img.alt = `Latest frame: ${task.prompt}`;
      card.append(img);
    }

    list.append(card);
  }

  // Left empty when there are no tasks. The suggested tiles above already answer an empty state, and a
  // sentence on top of them saying it is empty is noise rather than information.
  $('home-status').textContent = '';
}

// ---------- task tab ----------

function renderTask() {
  const task = openTaskId ? tasks.get(openTaskId) : undefined;
  if (!task) {
    $('task-title').textContent = 'Task not found';
    $('task-state').textContent = '';
    return;
  }

  document.title = `${task.prompt} · Redrob`;
  $('task-title').textContent = task.prompt;
  $('task-state').textContent = stateLabel(task.state);
  $('task-effort').textContent =
      task.workingFolder ? `${effortLabel(task.effort)} · ${task.workingFolder}`
                         : effortLabel(task.effort);

  // Stop only exists while there is something to stop, and the composer's second button appears with
  // it: interrupting is only a question when the task is mid-run.
  const running = isRunning(task);
  $('task-stop').hidden = !running;
  $('reply-steer').hidden = !running;
  $<HTMLButtonElement>('reply-send').setAttribute(
      'aria-label', running ? 'Queue this for the next step' : 'Send reply');

  const queued = $<HTMLOListElement>('queued');
  queued.textContent = '';
  queued.hidden = task.queued.length === 0;
  for (const pending of task.queued) {
    const item = document.createElement('li');
    item.textContent = pending;
    queued.append(item);
  }
  paintModeButtons(task.mode);

  const trace = $('trace');
  // Whether the user was already reading the newest part. A live task appends to the bottom, and
  // yanking the view down while someone is reading further up is worse than letting them scroll.
  const wasAtBottom =
      trace.scrollHeight - trace.scrollTop - trace.clientHeight < 40;
  trace.textContent = '';
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
      trace.append(prose);
    }
  }
  for (const step of task.steps) {
    trace.append(renderStep(step));
  }
  if (task.error) {
    const error = document.createElement('p');
    error.className = 'task-error';
    error.textContent = task.error;
    trace.append(error);
  }
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
    for (const image of trace.querySelectorAll('img')) {
      image.addEventListener('load', stick, {once: true});
    }
  }

  // The preview beside the trace is the newest frame the browser captured. A real embedded view of
  // the agent's tab is a guest view and is deliberately later work -- see docs/UI.md step 8.
  const latest = [...task.steps].reverse().find((s) => s.previewDataUrl);
  const preview = $('preview');
  if (latest?.previewDataUrl) {
    $<HTMLImageElement>('preview-image').src = latest.previewDataUrl;
    $<HTMLImageElement>('preview-image').alt = `Captured frame: ${latest.label}`;
    $('preview-title').textContent = latest.label;
    preview.hidden = false;
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

// The mode a NEW task starts in. Guard, not full access: the narrowest posture that can still do the
// job is the right default, and widening is a decision the user makes deliberately.
let composerMode: PermissionMode = PermissionMode.kGuard;

const MODES: Record<string, PermissionMode> = {
  read: PermissionMode.kReadOnly,
  guard: PermissionMode.kGuard,
  full: PermissionMode.kFullAccess,
};

// Scoped to the visible view. Both composers carry the same three chips, so addressing them by id
// meant every lookup found the home form's copy and the task tab's chips did nothing at all.
function modeButtons(): HTMLButtonElement[] {
  const root = openTaskId ? $('task') : $('home');
  return [...root.querySelectorAll<HTMLButtonElement>('[data-mode]')];
}

function paintModeButtons(current: PermissionMode) {
  for (const button of modeButtons()) {
    const mode = MODES[button.dataset['mode'] ?? ''];
    button.setAttribute('aria-pressed', String(mode === current));
  }
}

// On the home composer the mode is just picked. On a task tab it is a REQUEST: the browser refuses to
// widen a task that is already running, so the buttons are repainted from what it accepted rather than
// from what was clicked.
function bindModeButtons(taskId: string|null) {
  for (const button of modeButtons()) {
    const mode = MODES[button.dataset['mode'] ?? ''];
    if (mode === undefined) {
      continue;
    }
    button.addEventListener('click', async () => {
      if (!taskId) {
        composerMode = mode;
        paintModeButtons(composerMode);
        return;
      }
      const {accepted} = await host.setPermissionMode(taskId, mode);
      if (!accepted) {
        $('task-status').textContent =
            'A running task cannot be given more access. Start a new task instead.';
      }
    });
  }
  paintModeButtons(composerMode);
}

if (openTaskId) {
  $('task').hidden = false;
  bindModeButtons(openTaskId);

  $<HTMLButtonElement>('task-stop').addEventListener('click', () => {
    host.cancelTask(openTaskId);
  });

  $<HTMLButtonElement>('pick-folder').addEventListener('click', async () => {
    const {displayPath} = await host.chooseWorkingFolder(openTaskId);
    $('task-status').textContent = displayPath
        ? `Files from this task go in "${displayPath}".`
        : 'No folder was chosen, so this task still cannot write files.';
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
          'That could not be sent. There may already be too many messages waiting.';
      return;
    }
    field.value = '';
    // Said plainly, because "queued" and "interrupted" are genuinely different things to have just
    // done and the trace will show them differently too.
    switch (outcome) {
      case FollowUpOutcome.kInterrupted:
        $('task-status').textContent = 'Interrupted — it is working on this instead.';
        break;
      case FollowUpOutcome.kQueued:
        $('task-status').textContent = 'Waiting for the current step to finish.';
        break;
      default:
        $('task-status').textContent = 'Sent.';
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
    $('preview').hidden = true;
  });

  const {task} = await host.getTask(openTaskId);
  if (task) {
    tasks.set(task.id, task);
  }
  render();
} else {
  $('home').hidden = false;
  bindModeButtons(null);

  // The reason this surface exists is to be typed into.
  $<HTMLInputElement>('prompt').focus();

  for (const tile of document.querySelectorAll<HTMLElement>('.tile')) {
    tile.addEventListener('click', () => {
      const field = $<HTMLInputElement>('prompt');
      field.value = tile.dataset['prompt'] ?? '';
      field.focus();
    });
  }

  // Search is the browser's job, not the agent's. Handing the omnibox the query keeps one search
  // path in the product rather than a second one that only works on this page.
  $<HTMLButtonElement>('mode-search').addEventListener('click', () => {
    const query = $<HTMLInputElement>('prompt').value.trim();
    if (query) {
      location.href = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    }
  });

  $<HTMLFormElement>('composer').addEventListener('submit', async (event: Event) => {
    event.preventDefault();
    const field = $<HTMLInputElement>('prompt');
    const prompt = field.value.trim();
    if (!prompt) {
      return;
    }
    const chosen = $<HTMLSelectElement>('effort').value;
    const effort = chosen === 'ultra' ? Effort.kUltrabrowse
                 : chosen === 'quick' ? Effort.kQuick
                                      : Effort.kStandard;
    // Context refs are opaque handles the browser resolves. None are collected yet -- the `@` picker
    // is later work -- and sending a URL here instead would be exactly the shortcut the design forbids.
    const {taskId, error} = await host.startTask(prompt, [], composerMode, effort);
    if (error !== null && error !== undefined) {
      $('home-status').textContent =
          'Could not start the task: the Redrob Code engine is not available.';
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
        askedFromCommandLine, [], PermissionMode.kGuard, Effort.kStandard);
    if (error !== null && error !== undefined) {
      $('home-status').textContent =
          'That command could not be run: the Redrob Code engine is not available.';
    } else if (taskId) {
      // Replaced, not pushed: the prompt should not stay in this tab's URL, and Back should not re-run
      // the task.
      location.replace(`chrome://redrob/?task=${encodeURIComponent(taskId)}`);
    }
  }
}
