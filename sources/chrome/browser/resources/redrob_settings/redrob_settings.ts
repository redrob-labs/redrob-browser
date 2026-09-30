// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// First, before anything that can paint. See theme.ts.
import './theme.js';

import {
  Effort,
  EngineState,
  PageHandlerFactory,
  PermissionMode,
  RoutineKind,
  SettingsHostRemote,
} from './redrob_settings.mojom-webui.js';
import type {AgentSettings, EngineInfo, MemoryEntry, Provider, Routine} from './redrob_settings.mojom-webui.js';
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

// The settings the page last drew from. Held so a control that only changes what is DISPLAYED -- the
// memory search -- can redraw without asking the browser process for the whole settings struct again on
// every keystroke.
let lastSettings: AgentSettings|undefined;

async function refresh() {
  const {settings} = await host.getSettings();
  lastSettings = settings;
  renderRoutines(settings.routines, settings.chats);
  renderMemory(settings);
  renderProviders(settings);
  renderPasswords(settings);
  renderFiles(settings);
  renderRpc(settings);
}

// The routine being edited, or null when the form is adding a new one. UpdateRoutine has existed in the
// mojom since routines shipped and nothing called it: the form only ever added, so changing a routine's
// instruction or schedule meant deleting it and retyping the whole thing.
let editing: Routine|null = null;

function beginEdit(routine: Routine) {
  editing = routine;
  $<HTMLInputElement>('routine-title').value = routine.title;
  $<HTMLTextAreaElement>('routine-prompt').value = routine.prompt;
  $<HTMLSelectElement>('routine-kind').value =
      routine.kind === RoutineKind.kHeartbeat ? 'heartbeat' : 'cron';
  $<HTMLSelectElement>('routine-every').value = String(routine.everyMinutes);
  $<HTMLSelectElement>('routine-mode').value = String(routine.mode);
  $<HTMLSelectElement>('routine-effort').value = String(routine.effort);
  if (routine.taskId) {
    $<HTMLSelectElement>('routine-chat').value = routine.taskId;
  }
  paintFormMode();
  // The form is below the list, so on a long list the fields it just filled are off-screen.
  $('routine-form').scrollIntoView({block: 'nearest'});
  $<HTMLTextAreaElement>('routine-prompt').focus();
}

function endEdit() {
  editing = null;
  $<HTMLInputElement>('routine-title').value = '';
  $<HTMLTextAreaElement>('routine-prompt').value = '';
  paintFormMode();
}

// The same form is the editor, so it has to say which it is. An "Add routine" button that silently
// overwrites an existing routine would be the worst version of this.
function paintFormMode() {
  $('routine-form-title').textContent = editing
      ? loadTimeData.getStringF('seRoutineEditing', editing.title || editing.prompt.slice(0, 40))
      : loadTimeData.getString('seRoutineNew');
  $('routine-submit').textContent = editing
      ? loadTimeData.getString('seRoutineSave')
      : loadTimeData.getString('seRoutineAdd');
  $('routine-cancel-edit').hidden = !editing;
  // Which chat a heartbeat wakes cannot be moved to a different chat: the routine's accumulated context
  // lives in that one. Kind is fixed while editing for the same reason.
  $<HTMLSelectElement>('routine-kind').disabled = editing !== null;
}

function renderRoutines(routines: Routine[], chats: AgentSettings['chats']) {  const list = $<HTMLOListElement>('routine-list');
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
        button(loadTimeData.getString('seRoutineEdit'), 'pill', () => {
          beginEdit(routine);
        }),
        button(loadTimeData.getString('seRoutineDelete'), 'pill pill-warn', async () => {
          const ok = await confirmDestructive(
              loadTimeData.getStringF('seDeleteRoutineTitle', routine.title || routine.prompt.slice(0, 40)),
              loadTimeData.getString('seDeleteRoutineBody'),
              loadTimeData.getString('seRoutineDelete'));
          if (!ok) {
            return;
          }
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

  const all = settings.memory.entries;
  // The query filters the entry text and the prompt it came from, because "why do you know this" is as
  // likely to be what someone is looking for as the fact itself.
  const query = $<HTMLInputElement>('memory-search').value.trim().toLowerCase();
  const shown = query
      ? all.filter((entry) => entry.text.toLowerCase().includes(query) ||
                              (entry.source ?? '').toLowerCase().includes(query))
      : all;

  const list = $<HTMLOListElement>('memory-list');
  list.textContent = '';
  for (const entry of shown) {
    list.append(renderMemoryRow(entry));
  }

  // Three different nothings, said differently: nothing remembered, nothing matching, or a count.
  const emptyStore = all.length === 0;
  $('memory-empty').hidden = !emptyStore;
  $('memory-nomatch').hidden = emptyStore || shown.length > 0;
  const count = $('memory-count');
  count.hidden = !query || emptyStore;
  count.textContent = loadTimeData.getStringF('seMemoryShowing', shown.length, all.length);
  // The search itself is pointless on an empty store, and a disabled control says so without a sentence.
  $<HTMLInputElement>('memory-search').disabled = emptyStore;
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
  // The model and endpoint here are no longer invented: nothing reads them for the built-in row, which
  // now reports the engine's real state instead. They stay only because Provider requires them.
  list.append(providerRow(
      {id: '', label: loadTimeData.getString('seProviderRedrobEngine'), model: '', endpoint: '',
       hasSecret: false, isOauth: false},
      settings.model.selectedId === '', /*builtIn=*/ true, settings.model.engine));
  for (const provider of settings.model.providers) {
    list.append(providerRow(provider, settings.model.selectedId === provider.id, false));
  }

  if (!settings.model.encryptionReady) {
    $('provider-status').textContent =
        loadTimeData.getString('seKeystoreNotReady');
  }
}

// What the built-in row says about the engine. Status first, because it is the fact a reader can act on:
// an ephemeral loopback port changes every launch and tells them nothing, while "not installed" explains
// every task failing at once. The two nothing-there states stay distinct -- not installed is the ordinary
// condition of a machine that never downloaded the engine, failed means it was there and broke.
function engineMeta(engine: EngineInfo): string {
  switch (engine.state) {
    case EngineState.kReady:
      // Only here is a model count a fact. Elsewhere zero means "not asked yet", not "none exist", and
      // printing "0 models" would be inventing an answer the browser does not have.
      return `${loadTimeData.getString('seEngineReady')} · ${engine.defaultModel} · ` +
          loadTimeData.getStringF('seEngineModelCount', engine.modelCount);
    case EngineState.kStarting:
      return loadTimeData.getString('seEngineStarting');
    case EngineState.kFailed:
      return loadTimeData.getString('seEngineFailed');
    case EngineState.kNotInstalled:
    default:
      return loadTimeData.getString('seEngineNotInstalled');
  }
}

function providerRow(provider: Provider, selected: boolean, builtIn: boolean,
                     engine?: EngineInfo): HTMLElement {
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
      // Was only ever "no key needed", which is true but says nothing about whether this row can run a
      // task at all. The engine's state is the part a reader is actually looking for.
      ? (engine ? engineMeta(engine) : loadTimeData.getString('seProviderNoKeyNeeded'))
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
      const ok = await confirmDestructive(
          loadTimeData.getStringF('seRemoveProviderTitle', provider.label),
          loadTimeData.getString('seRemoveProviderBody'),
          loadTimeData.getString('seProviderRemove'));
      if (!ok) {
        return;
      }
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
  paintChoiceGroup($('passwords').querySelector<HTMLElement>('.choice-row')!, settings.passwords.choice);
}

// A radiogroup, drawn and announced as one. This used to write `aria-pressed`, which belongs to a toggle
// button: a screen reader was told the container held radios and then found none, so the group announced
// nothing selected however it was drawn. It also reached for every `.choice` on the page rather than the
// ones in this group, which happens to work while there is one group and stops the moment there are two.
//
// Selection is `aria-checked`, and the group is ONE tab stop: only the checked option is tabbable, and
// the arrows move between them. That is what a radiogroup promises, and buttons do not do it by default.
function paintChoiceGroup(group: HTMLElement, selected: string) {
  const choices = [...group.querySelectorAll<HTMLElement>('.choice')];
  // Nothing matching means nothing selected yet, and the first option has to stay reachable by Tab --
  // a group where every option is tabindex -1 cannot be entered from the keyboard at all.
  const hasSelection = choices.some((choice) => choice.dataset['choice'] === selected);
  for (const [index, choice] of choices.entries()) {
    const on = choice.dataset['choice'] === selected;
    choice.ariaChecked = String(on);
    choice.tabIndex = (hasSelection ? on : index === 0) ? 0 : -1;
  }
}

// Arrows, Home and End, wrapping at both ends. Space and Enter come free with a <button>.
function wireChoiceKeys(group: HTMLElement, onPick: (choice: string) => void) {
  group.addEventListener('keydown', (event: KeyboardEvent) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
               : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1
                                                                     : 0;
    const choices = [...group.querySelectorAll<HTMLElement>('.choice')];
    const from = choices.findIndex((choice) => choice === document.activeElement);
    let next = -1;
    if (step !== 0 && from !== -1) {
      next = (from + step + choices.length) % choices.length;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = choices.length - 1;
    }
    if (next === -1) {
      return;
    }
    // Arrow keys would otherwise scroll the page under the group.
    event.preventDefault();
    const target = choices[next]!;
    target.focus();
    // In a radiogroup, moving to an option SELECTS it -- that is the pattern, not an extra keypress.
    target.click();
    onPick(target.dataset['choice'] ?? '');
  });
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
    id: editing ? editing.id : '',
    title: $<HTMLInputElement>('routine-title').value.trim(),
    prompt,
    kind: heartbeat ? RoutineKind.kHeartbeat : RoutineKind.kCron,
    everyMinutes: Number($<HTMLSelectElement>('routine-every').value),
    mode: Number($<HTMLSelectElement>('routine-mode').value) as PermissionMode,
    effort: Number($<HTMLSelectElement>('routine-effort').value) as Effort,
    // Editing must not silently resume a routine the user paused.
    enabled: editing ? editing.enabled : true,
    taskId: heartbeat ? taskId : '',
    lastRunMs: editing ? editing.lastRunMs : 0,
    nextRunMs: editing ? editing.nextRunMs : 0,
    lastError: editing ? editing.lastError : '',
  };
  if (editing) {
    const {ok} = await host.updateRoutine(routine);
    $('routine-status').textContent = ok
        ? loadTimeData.getString('seRoutineUpdated')
        : loadTimeData.getString('seRoutineUpdateFailed');
    if (ok) {
      endEdit();
    }
    await refresh();
    return;
  }
  const {id} = await host.addRoutine(routine);
  if (!id) {
    $('routine-status').textContent = loadTimeData.getString('seRoutineAddFailed');
    return;
  }
  $<HTMLInputElement>('routine-title').value = '';
  $<HTMLTextAreaElement>('routine-prompt').value = '';
  $('routine-status').textContent = loadTimeData.getString('seRoutineAdded');
  await refresh();
});

$<HTMLButtonElement>('routine-cancel-edit').addEventListener('click', () => {
  endEdit();
  $('routine-status').textContent = '';
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

// One confirmation for every destructive action here. Resolves true only if the user pressed the
// action's own button: Escape, the Cancel button and the backdrop all resolve false, because a dialog
// that treats "dismissed" as "yes" is worse than no dialog. The confirm button is labelled with the
// action rather than "OK", so the last thing read before the click says what happens.
function confirmDestructive(title: string, body: string, action: string): Promise<boolean> {
  const dialog = $<HTMLDialogElement>('confirm');
  $('confirm-title').textContent = title;
  $('confirm-body').textContent = body;
  $('confirm-go').textContent = action;
  return new Promise((resolve) => {
    let confirmed = false;
    const go = () => {
      confirmed = true;
      dialog.close();
    };
    // A plain <button> inside a <dialog> does not close it, so Cancel needs this. Escape and the
    // backdrop already fire `close` on their own, and all three land on the same false.
    const cancel = () => dialog.close();
    const closed = () => {
      $('confirm-go').removeEventListener('click', go);
      $('confirm-cancel').removeEventListener('click', cancel);
      dialog.removeEventListener('close', closed);
      resolve(confirmed);
    };
    $('confirm-go').addEventListener('click', go);
    $('confirm-cancel').addEventListener('click', cancel);
    dialog.addEventListener('close', closed);
    dialog.showModal();
    // Focus starts on Cancel, so a stray Enter on a keyboard does the harmless thing.
    $<HTMLButtonElement>('confirm-cancel').focus();
  });
}

$<HTMLButtonElement>('memory-forget').addEventListener('click', async () => {
  const ok = await confirmDestructive(
      loadTimeData.getString('seForgetTitle'), loadTimeData.getString('seForgetBody'),
      loadTimeData.getString('seMemoryForget'));
  if (!ok) {
    return;
  }
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

// Scoped to the password group, not every `.choice` on the page: the selector above was global, which is
// correct only for as long as this page has exactly one chooser.
const passwordChoices = $('passwords').querySelector<HTMLElement>('.choice-row')!;
for (const choice of passwordChoices.querySelectorAll<HTMLButtonElement>('.choice')) {
  choice.addEventListener('click', async () => {
    const value = choice.dataset['choice'] ?? '';
    host.setPasswordManagerChoice(value);
    $('password-status').textContent = value === 'external'
        ? loadTimeData.getString('sePasswordsSavingOff')
        : '';
    await refresh();
  });
}
// The keyboard half. The click handler above does the work, so this only has to move focus and fire it.
wireChoiceKeys(passwordChoices, () => {});

$<HTMLInputElement>('password-save').addEventListener('change', () => {
  host.setOfferToSavePasswords($<HTMLInputElement>('password-save').checked);
});

$<HTMLInputElement>('password-autosignin').addEventListener('change', () => {
  host.setPasswordAutoSignin($<HTMLInputElement>('password-autosignin').checked);
});

$<HTMLButtonElement>('open-onboarding').addEventListener('click', () => {
  // This tab, not a new one: a WebUI page opening a popup is at the mercy of the popup blocker, and the tour
  // is a full-page flow rather than something to read beside the settings. Its own final button navigates to
  // the new tab, so there is a way out that does not depend on the back button.
  location.href = 'chrome://redrob-onboarding/';
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

$<HTMLInputElement>('memory-search').addEventListener('input', () => {
  // Display-only, so it redraws from what the page already has rather than refetching per keystroke.
  if (lastSettings) {
    renderMemory(lastSettings);
  }
});

// ---------- routing ----------

// Which section is shown, driven by the URL. The nav used to be seven anchor jumps into one long scroll:
// no current state, and a link to a section from elsewhere in the product landed in the middle of a page
// with six others above and below. The fragment is the route, so every section is linkable and Back works.
const SECTIONS = ['getting-started', 'routines', 'memory', 'models', 'passwords', 'cli', 'files', 'appearance'];

function routeTo(id: string) {
  // An unknown or empty fragment falls back to the first section rather than showing nothing, which is
  // what a plain :target rule would have done on a first visit with no hash.
  const current = SECTIONS.includes(id) ? id : SECTIONS[0]!;
  for (const section of SECTIONS) {
    $(section).classList.toggle('is-current', section === current);
  }
  for (const link of document.querySelectorAll<HTMLAnchorElement>('.nav-link')) {
    const target = link.getAttribute('href') ?? '';
    if (target.startsWith('#')) {
      // Set and removed rather than set to 'false': aria-current has no false value, and the attribute's
      // absence is what "not current" means.
      if (target.slice(1) === current) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    }
  }
  // Focus is deliberately NOT moved here. An earlier version set tabIndex = -1 on the section's heading
  // and focused it, which made the heading focusable and therefore ring-able: the browser drew its focus
  // ring as a full-width black box around the title on every route. A fragment navigation already moves
  // focus to the target section, so the code was both unnecessary and visible.
  document.querySelector('.pages')!.scrollTop = 0;
}

window.addEventListener('hashchange', () => routeTo(location.hash.slice(1)));
routeTo(location.hash.slice(1));

await refresh();
