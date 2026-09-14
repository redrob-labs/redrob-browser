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
import {loadTimeData} from 'chrome://resources/js/load_time_data.js';

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
    return future ? loadTimeData.getString('seInUnderAMinute') : loadTimeData.getString('taskJustNow');
  }
  const text = mins < 60 ? `${mins}m`
             : mins < 1440 ? `${Math.round(mins / 60)}h`
                           : `${Math.round(mins / 1440)}d`;
  return future ? `in ${text}` : `${text} ago`;
}

function everyLabel(minutes: number): string {
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? loadTimeData.getString('seEveryDay')
       : days === 7 ? loadTimeData.getString('seEveryWeek')
                    : loadTimeData.getStringF('seEveryDays', days);
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? loadTimeData.getString('seEveryHour') : loadTimeData.getStringF('seEveryHours', hours);
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
  renderRpc(settings);
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
    const kind = routine.kind === RoutineKind.kHeartbeat ? loadTimeData.getString('seRoutineKindWakes')
                                                        : loadTimeData.getString('seRoutineKindNew');
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
        button(loadTimeData.getString('seRoutineRunNow'), 'pill', async () => {
          const {taskId} = await host.runRoutineNow(routine.id);
          $('routine-status').textContent = taskId
              ? loadTimeData.getString('seRoutineStarted')
              : loadTimeData.getString('seRoutineNotStarted');
          await refresh();
        }),
        button(routine.enabled ? loadTimeData.getString('seRoutinePause') : loadTimeData.getString('seRoutineResume'), 'pill', async () => {
          await host.setRoutineEnabled(routine.id, !routine.enabled);
          await refresh();
        }),
        button(loadTimeData.getString('seRoutineDelete'), 'pill pill-warn', async () => {
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
      button(entry.pinned ? loadTimeData.getString('seMemoryUnpin') : loadTimeData.getString('seMemoryPin'),
                     entry.pinned ? 'pill pill-on' : 'pill', async () => {
        await host.setMemoryPinned(entry.id, !entry.pinned);
        await refresh();
      }),
      button(loadTimeData.getString('seRoutineDelete'), 'pill pill-warn', async () => {
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
      {id: '', label: loadTimeData.getString('seProviderRedrobEngine'), model: 'redrob/auto', endpoint: '', hasSecret: false,
       isOauth: false},
      settings.model.selectedId === '', /*builtIn=*/ true));
  for (const provider of settings.model.providers) {
    list.append(providerRow(provider, settings.model.selectedId === provider.id, false));
  }

  if (!settings.model.encryptionReady) {
    $('provider-status').textContent =
        loadTimeData.getString('seKeystoreNotReady');
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
      ? loadTimeData.getString('seProviderNoKeyNeeded')
      : `${provider.model} · ${provider.endpoint} · ` +
        (provider.isOauth ? loadTimeData.getString('seProviderOauthOk')
                          : provider.hasSecret ? loadTimeData.getString('seProviderKeyStored') : loadTimeData.getString('seProviderNoKey'));
  body.append(title, meta);

  const actions = document.createElement('div');
  actions.className = 'row-actions';
  actions.append(button(selected ? loadTimeData.getString('seProviderInUse') : loadTimeData.getString('seProviderUse'),
                        selected ? 'pill pill-on' : 'pill', async () => {
    if (selected) {
      return;
    }
    await host.selectProvider(provider.id);
    await refresh();
  }));
  if (!builtIn) {
    actions.append(button(loadTimeData.getString('seProviderRemove'), 'pill pill-warn', async () => {
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

function renderRpc(settings: AgentSettings) {
  $<HTMLInputElement>('rpc-enabled').checked = settings.rpc.enabled;
  $('rpc-endpoint').textContent = settings.rpc.endpoint || 'nothing';
  $('rpc-handle').textContent = settings.rpc.handleFileName;
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
    $('routine-status').textContent = loadTimeData.getString('seRoutineNeedsPrompt');
    return;
  }
  const heartbeat = $<HTMLSelectElement>('routine-kind').value === 'heartbeat';
  const taskId = $<HTMLSelectElement>('routine-chat').value;
  if (heartbeat && !taskId) {
    $('routine-status').textContent =
        loadTimeData.getString('seRoutineNeedsChat');
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
    $('routine-status').textContent = loadTimeData.getString('seRoutineAddFailed');
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
  $('memory-status').textContent = loadTimeData.getString('seMemoryTrimmed');
  await refresh();
});

$<HTMLButtonElement>('memory-forget').addEventListener('click', async () => {
  host.forgetEverything();
  // Everything, pinned included -- said out loud, because the point of the button is certainty.
  $('memory-status').textContent = loadTimeData.getString('seMemoryCleared');
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
        loadTimeData.getString('seProviderSaveFailed');
    return;
  }
  $<HTMLInputElement>('provider-label').value = '';
  $<HTMLInputElement>('provider-model').value = '';
  $<HTMLInputElement>('provider-endpoint').value = '';
  $('provider-status').textContent = loadTimeData.getString('seProviderConnected');
  await refresh();
});

for (const choice of document.querySelectorAll<HTMLButtonElement>('.choice')) {
  choice.addEventListener('click', async () => {
    const value = choice.dataset['choice'] ?? '';
    host.setPasswordManagerChoice(value);
    $('password-status').textContent = value === 'external'
        ? loadTimeData.getString('sePasswordsSavingOff')
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

// The provider appears in the list only once tokens have actually arrived, so this watches for it
// rather than claiming success when the tab opens. Bounded: a sign-in nobody finishes should not leave
// the page polling for the rest of the session.
async function waitForSignIn(label: string) {
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const {settings} = await host.getSettings();
    if (settings.model.providers.some((p) => p.label === label && p.hasSecret)) {
      $('signin-status').textContent = loadTimeData.getString('seSigninDone');
      await refresh();
      return;
    }
  }
  $('signin-status').textContent =
      loadTimeData.getString('seSigninNotDone');
}

$<HTMLFormElement>('signin-form').addEventListener('submit', async (event: Event) => {
  event.preventDefault();
  const label = $<HTMLInputElement>('signin-label').value.trim();
  const {error} = await host.beginProviderSignIn(
      label, $<HTMLInputElement>('signin-model').value.trim(),
      $<HTMLInputElement>('signin-endpoint').value.trim(),
      $<HTMLInputElement>('signin-authorize').value.trim(),
      $<HTMLInputElement>('signin-token').value.trim(),
      $<HTMLInputElement>('signin-client').value.trim(),
      $<HTMLInputElement>('signin-scopes').value.trim());
  if (error) {
    $('signin-status').textContent = error;
    return;
  }
  $('signin-status').textContent = loadTimeData.getString('seSigninWaiting');
  void waitForSignIn(label);
});

$<HTMLInputElement>('rpc-enabled').addEventListener('change', async () => {
  const wanted = $<HTMLInputElement>('rpc-enabled').checked;
  const {endpoint} = await host.setRpcEnabled(wanted);
  $('rpc-status').textContent = wanted
      ? (endpoint ? loadTimeData.getStringF('seCliListeningAt', endpoint)
                  : loadTimeData.getString('seCliBindFailed'))
      : loadTimeData.getString('seCliStopped');
  await refresh();
});

$<HTMLButtonElement>('folder-pick').addEventListener('click', async () => {
  const {displayPath} = await host.chooseWorkingFolder();
  $('folder-status').textContent = displayPath
      ? ''
      : loadTimeData.getString('seFilesNoFolderChosen');
  await refresh();
});

$<HTMLButtonElement>('folder-clear').addEventListener('click', async () => {
  host.clearWorkingFolder();
  await refresh();
});

await refresh();
