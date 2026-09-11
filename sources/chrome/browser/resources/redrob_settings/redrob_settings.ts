// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {
  Effort,
  PageHandlerFactory,
  PermissionMode,
  RoutineKind,
  SettingsHostRemote,
} from './redrob_settings.mojom-webui.js';
import type {AgentSettings, MemoryEntry, Provider, Routine} from './redrob_settings.mojom-webui.js';

// One remote, no page-observer interface: settings state changes because THIS page changed it, so it
// refetches rather than subscribing. A routine firing in the background is the one exception, and a
// stale "next run" until the next visit is not worth a push channel.
const host = new SettingsHostRemote();
PageHandlerFactory.getRemote().createSettingsHost(host.$.bindNewPipeAndPassReceiver());

function $<T extends HTMLElement>(id: string): T {
  return document.querySelector<T>(`#${id}`)!;
}

function relative(ms: number): string {
  if (!ms) {
    return 'never';
  }
  const delta = Date.now() - ms;
  const future = delta < 0;
  const mins = Math.round(Math.abs(delta) / 60000);
  if (mins < 1) {
    return future ? 'in under a minute' : 'just now';
  }
  const text = mins < 60 ? `${mins}m`
             : mins < 1440 ? `${Math.round(mins / 60)}h`
                           : `${Math.round(mins / 1440)}d`;
  return future ? `in ${text}` : `${text} ago`;
}

function everyLabel(minutes: number): string {
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? 'every day' : days === 7 ? 'every week' : `every ${days} days`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? 'every hour' : `every ${hours} hours`;
  }
  return `every ${minutes} minutes`;
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.textContent = label;
  element.addEventListener('click', onClick);
  return element;
}

// ---------- render ----------

async function refresh() {
  const {settings} = await host.getSettings();
  renderRoutines(settings.routines, settings.chats);
  renderMemory(settings);
  renderProviders(settings);
  renderPasswords(settings);
  renderFiles(settings);
}

function renderRoutines(routines: Routine[], chats: AgentSettings['chats']) {
  const list = $<HTMLOListElement>('routine-list');
  list.textContent = '';
  $('routine-empty').hidden = routines.length > 0;

  for (const routine of routines) {
    const row = document.createElement('li');
    row.className = 'row';

    const body = document.createElement('div');
    body.className = 'row-body';
    const title = document.createElement('div');
    title.className = 'row-title';
    title.textContent = routine.title || routine.prompt.slice(0, 60);
    const detail = document.createElement('div');
    detail.className = 'row-detail';
    detail.textContent = routine.prompt;
    const meta = document.createElement('div');
    meta.className = 'row-meta';
    const kind = routine.kind === RoutineKind.kHeartbeat ? 'wakes a chat' : 'new task';
    meta.textContent = `${kind} · ${everyLabel(routine.everyMinutes)} · ` +
        `last ${relative(routine.lastRunMs)} · next ${relative(routine.nextRunMs)}` +
        (routine.enabled ? '' : ' · paused');
    body.append(title, detail, meta);
    // A routine that was skipped says so here. Silence would look like success.
    if (routine.lastError) {
      const warn = document.createElement('div');
      warn.className = 'row-meta row-warn';
      warn.textContent = routine.lastError;
      body.append(warn);
    }

    const actions = document.createElement('div');
    actions.className = 'row-actions';
    actions.append(
        button('Run now', 'pill', async () => {
          const {taskId} = await host.runRoutineNow(routine.id);
          $('routine-status').textContent = taskId
              ? 'Started. It is in Chats.'
              : 'Not started — check the reason on the routine.';
          await refresh();
        }),
        button(routine.enabled ? 'Pause' : 'Resume', 'pill', async () => {
          await host.setRoutineEnabled(routine.id, !routine.enabled);
          await refresh();
        }),
        button('Delete', 'pill pill-warn', async () => {
          await host.removeRoutine(routine.id);
          await refresh();
        }));

    row.append(body, actions);
    list.append(row);
  }

  const picker = $<HTMLSelectElement>('routine-chat');
  const previous = picker.value;
  picker.textContent = '';
  for (const chat of chats) {
    const option = document.createElement('option');
    option.value = chat.id;
    option.textContent = chat.prompt.slice(0, 70);
    picker.append(option);
  }
  if (previous) {
    picker.value = previous;
  }
}

function renderMemory(settings: AgentSettings) {
  $<HTMLInputElement>('memory-enabled').checked = settings.memory.enabled;
  $<HTMLSelectElement>('memory-retention').value = String(settings.memory.retentionDays);

  const list = $<HTMLOListElement>('memory-list');
  list.textContent = '';
  $('memory-empty').hidden = settings.memory.entries.length > 0;
  for (const entry of settings.memory.entries) {
    list.append(renderMemoryRow(entry));
  }
}

function renderMemoryRow(entry: MemoryEntry): HTMLElement {
  const row = document.createElement('li');
  row.className = 'row';
  const body = document.createElement('div');
  body.className = 'row-body';
  const text = document.createElement('div');
  text.textContent = entry.text;
  const meta = document.createElement('div');
  meta.className = 'row-meta';
  // The source is the task's own prompt, which is the honest answer to "why do you know this".
  meta.textContent = `${relative(entry.createdMs)}` +
      (entry.source ? ` · from “${entry.source.slice(0, 60)}”` : '') +
      (entry.pinned ? ' · pinned' : '');
  body.append(text, meta);

  const actions = document.createElement('div');
  actions.className = 'row-actions';
  actions.append(
      button(entry.pinned ? 'Unpin' : 'Pin', entry.pinned ? 'pill pill-on' : 'pill', async () => {
        await host.setMemoryPinned(entry.id, !entry.pinned);
        await refresh();
      }),
      button('Delete', 'pill pill-warn', async () => {
        await host.removeMemory(entry.id);
        await refresh();
      }));

  row.append(body, actions);
  return row;
}

function renderProviders(settings: AgentSettings) {
  const list = $<HTMLOListElement>('provider-list');
  list.textContent = '';

  // The built-in engine is a row like any other, because "which model" should have one list rather
  // than a default hidden behind the absence of a selection.
  list.append(providerRow(
      {id: '', label: 'Redrob engine', model: 'redrob/auto', endpoint: '', hasSecret: false},
      settings.model.selectedId === '', /*builtIn=*/ true));
  for (const provider of settings.model.providers) {
    list.append(providerRow(provider, settings.model.selectedId === provider.id, false));
  }

  if (!settings.model.encryptionReady) {
    $('provider-status').textContent =
        'This machine\u2019s keystore has not answered yet, so a key cannot be stored safely. Try again in a moment.';
  }
}

function providerRow(provider: Provider, selected: boolean, builtIn: boolean): HTMLElement {
  const row = document.createElement('li');
  row.className = 'row';
  const body = document.createElement('div');
  body.className = 'row-body';
  const title = document.createElement('div');
  title.className = 'row-title';
  title.textContent = provider.label;
  const meta = document.createElement('div');
  meta.className = 'row-meta';
  meta.textContent = builtIn
      ? 'runs on this machine · no key needed'
      : `${provider.model} · ${provider.endpoint}` + (provider.hasSecret ? ' · key stored' : ' · no key');
  body.append(title, meta);

  const actions = document.createElement('div');
  actions.className = 'row-actions';
  actions.append(button(selected ? 'In use' : 'Use', selected ? 'pill pill-on' : 'pill', async () => {
    if (selected) {
      return;
    }
    await host.selectProvider(provider.id);
    await refresh();
  }));
  if (!builtIn) {
    actions.append(button('Remove', 'pill pill-warn', async () => {
      await host.removeProvider(provider.id);
      await refresh();
    }));
  }

  row.append(body, actions);
  return row;
}

function renderPasswords(settings: AgentSettings) {
  $<HTMLInputElement>('password-save').checked = settings.passwords.offerToSave;
  $<HTMLInputElement>('password-autosignin').checked = settings.passwords.autoSignin;
  for (const choice of document.querySelectorAll<HTMLButtonElement>('.choice')) {
    choice.setAttribute(
        'aria-pressed', String(choice.dataset['choice'] === settings.passwords.choice));
  }
}

function renderFiles(settings: AgentSettings) {
  $('folder-name').textContent = settings.workingFolder || 'none';
}

// ---------- wiring ----------

$<HTMLSelectElement>('routine-kind').addEventListener('change', () => {
  const heartbeat = $<HTMLSelectElement>('routine-kind').value === 'heartbeat';
  $('routine-chat-field').hidden = !heartbeat;
});

$<HTMLFormElement>('routine-form').addEventListener('submit', async (event: Event) => {
  event.preventDefault();
  const prompt = $<HTMLTextAreaElement>('routine-prompt').value.trim();
  if (!prompt) {
    $('routine-status').textContent = 'A routine needs something to do.';
    return;
  }
  const heartbeat = $<HTMLSelectElement>('routine-kind').value === 'heartbeat';
  const taskId = $<HTMLSelectElement>('routine-chat').value;
  if (heartbeat && !taskId) {
    $('routine-status').textContent =
        'There is no chat to wake yet. Start a task first, then point a heartbeat at it.';
    return;
  }
  const routine: Routine = {
    id: '',
    title: $<HTMLInputElement>('routine-title').value.trim(),
    prompt,
    kind: heartbeat ? RoutineKind.kHeartbeat : RoutineKind.kCron,
    everyMinutes: Number($<HTMLSelectElement>('routine-every').value),
    mode: Number($<HTMLSelectElement>('routine-mode').value) as PermissionMode,
    effort: Number($<HTMLSelectElement>('routine-effort').value) as Effort,
    enabled: true,
    taskId: heartbeat ? taskId : '',
    lastRunMs: 0,
    nextRunMs: 0,
    lastError: '',
  };
  const {id} = await host.addRoutine(routine);
  if (!id) {
    $('routine-status').textContent = 'That could not be added.';
    return;
  }
  $<HTMLInputElement>('routine-title').value = '';
  $<HTMLTextAreaElement>('routine-prompt').value = '';
  $('routine-status').textContent = 'Added.';
  await refresh();
});

$<HTMLInputElement>('memory-enabled').addEventListener('change', async () => {
  host.setMemoryEnabled($<HTMLInputElement>('memory-enabled').checked);
  await refresh();
});

$<HTMLSelectElement>('memory-retention').addEventListener('change', async () => {
  host.setMemoryRetentionDays(Number($<HTMLSelectElement>('memory-retention').value));
  $('memory-status').textContent = 'Older entries were removed straight away.';
  await refresh();
});

$<HTMLButtonElement>('memory-forget').addEventListener('click', async () => {
  host.forgetEverything();
  // Everything, pinned included -- said out loud, because the point of the button is certainty.
  $('memory-status').textContent = 'Everything was deleted, pinned entries included.';
  await refresh();
});

$<HTMLFormElement>('provider-form').addEventListener('submit', async (event: Event) => {
  event.preventDefault();
  const secretField = $<HTMLInputElement>('provider-secret');
  const {id} = await host.addProvider(
      $<HTMLInputElement>('provider-label').value.trim(),
      $<HTMLInputElement>('provider-model').value.trim(),
      $<HTMLInputElement>('provider-endpoint').value.trim(), secretField.value);
  // Cleared whatever happened. A key left sitting in a form field is a key in a renderer.
  secretField.value = '';
  if (!id) {
    $('provider-status').textContent =
        'That could not be saved. The endpoint must be https, and the name, model and key are all required.';
    return;
  }
  $<HTMLInputElement>('provider-label').value = '';
  $<HTMLInputElement>('provider-model').value = '';
  $<HTMLInputElement>('provider-endpoint').value = '';
  $('provider-status').textContent = 'Connected. The key is stored encrypted and cannot be read back.';
  await refresh();
});

for (const choice of document.querySelectorAll<HTMLButtonElement>('.choice')) {
  choice.addEventListener('click', async () => {
    const value = choice.dataset['choice'] ?? '';
    host.setPasswordManagerChoice(value);
    $('password-status').textContent = value === 'external'
        ? 'Saving is off. Passwords already saved here are still there and can still be filled.'
        : '';
    await refresh();
  });
}

$<HTMLInputElement>('password-save').addEventListener('change', () => {
  host.setOfferToSavePasswords($<HTMLInputElement>('password-save').checked);
});

$<HTMLInputElement>('password-autosignin').addEventListener('change', () => {
  host.setPasswordAutoSignin($<HTMLInputElement>('password-autosignin').checked);
});

$<HTMLButtonElement>('password-open').addEventListener('click', () => {
  host.openPasswordManager();
});

$<HTMLButtonElement>('folder-pick').addEventListener('click', async () => {
  const {displayPath} = await host.chooseWorkingFolder();
  $('folder-status').textContent = displayPath
      ? ''
      : 'No folder was chosen. On Linux this needs a desktop file-chooser to be available.';
  await refresh();
});

$<HTMLButtonElement>('folder-clear').addEventListener('click', async () => {
  host.clearWorkingFolder();
  await refresh();
});

await refresh();
