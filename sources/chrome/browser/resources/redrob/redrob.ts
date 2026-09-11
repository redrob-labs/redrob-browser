// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {
  PageCallbackRouter,
  PageHandlerFactory,
  RoutingMode,
  TaskHostRemote,
  TaskState,
} from './redrob.mojom-webui.js';
import type {Task} from './redrob.mojom-webui.js';

// The page talks to the browser process and to nothing else. There is no fetch here and no key here:
// see docs/AI_SURFACE.md. A compromised renderer gets this method surface, not the engine.
const router = new PageCallbackRouter();
const host = new TaskHostRemote();
PageHandlerFactory.getRemote().createTaskHost(
    router.$.bindNewPipeAndPassRemote(), host.$.bindNewPipeAndPassReceiver());

const form = document.querySelector<HTMLFormElement>('#composer')!;
const promptField = document.querySelector<HTMLTextAreaElement>('#prompt')!;
const list = document.querySelector<HTMLOListElement>('#tasks')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;

// Rendered state is derived from what the browser process reports, never from what we just sent. A
// task card that showed "running" because the page asked for it would be lying about the engine.
const tasks = new Map<string, Task>();

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

function render() {
  list.textContent = '';
  for (const task of [...tasks.values()].reverse()) {
    const card = document.createElement('li');

    const head = document.createElement('div');
    head.className = 'card-head';
    const prompt = document.createElement('span');
    prompt.textContent = task.prompt;
    const state = document.createElement('span');
    state.className = 'card-state';
    state.textContent = stateLabel(task.state);
    head.append(prompt, state);
    card.append(head);

    if (task.steps.length > 0) {
      const steps = document.createElement('ul');
      steps.className = 'card-steps';
      for (const step of task.steps) {
        const item = document.createElement('li');
        item.textContent = step.label;
        steps.append(item);
      }
      card.append(steps);
    }

    if (task.error) {
      const error = document.createElement('p');
      error.className = 'card-error';
      error.textContent = task.error;
      card.append(error);
    }

    list.append(card);
  }
  status.textContent = tasks.size === 0 ? 'No tasks yet.' : '';
}

router.onTaskChanged.addListener((task: Task) => {
  tasks.set(task.id, task);
  render();
});

form.addEventListener('submit', async (event: Event) => {
  event.preventDefault();
  const prompt = promptField.value.trim();
  if (!prompt) {
    return;
  }
  const mode = (form.elements.namedItem('routing') as RadioNodeList).value;
  await host.setRouting(mode === 'guard' ? RoutingMode.kGuard : RoutingMode.kLocal);

  // Context refs are opaque handles the browser resolves. None are collected yet -- the `@` picker is
  // a later step -- and sending a URL here instead would be exactly the shortcut the design forbids.
  const {taskId, error} = await host.startTask(prompt, []);
  if (error !== null && error !== undefined) {
    // The engine is a separate process that a dev build has not downloaded, which is the common case.
    status.textContent = 'Could not start the task: the Redrob Code engine is not available.';
    return;
  }
  if (taskId) {
    promptField.value = '';
  }
});

const {tasks: existing} = await host.listTasks();
for (const task of existing) {
  tasks.set(task.id, task);
}
render();
