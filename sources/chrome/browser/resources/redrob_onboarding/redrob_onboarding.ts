// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {ImportState, OnboardingHostRemote, PageCallbackRouter, PageHandlerFactory} from
    './redrob_onboarding.mojom-webui.js';
import type {ImportSource} from './redrob_onboarding.mojom-webui.js';
import {loadTimeData} from 'chrome://resources/js/load_time_data.js';

// The page talks to the browser process and to nothing else. It cannot end its own flow, write the
// first-run pref, or read another browser's profile -- all of that is on the other side of this pipe.
const router = new PageCallbackRouter();
const host = new OnboardingHostRemote();
PageHandlerFactory.getRemote().createOnboardingHost(
    host.$.bindNewPipeAndPassReceiver(), router.$.bindNewPipeAndPassRemote());

// The step order IS the flow. Kept as data so the dots, the Back button and the Continue button all
// read from one place -- three separate notions of "where am I" is how a wizard ends up showing the
// wrong dot.
const STEPS = ['welcome', 'account', 'agent', 'passwords', 'model', 'import'] as const;
type Step = typeof STEPS[number];

let index = 0;
let importSources: ImportSource[] = [];
let importState: ImportState = ImportState.kIdle;

function $<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function stepEl(step: Step): HTMLElement {
  return document.querySelector<HTMLElement>(`.step[data-step="${step}"]`)!;
}

function render() {
  STEPS.forEach((step, i) => {
    stepEl(step).hidden = i !== index;
  });

  const dots = $('dots');
  dots.textContent = '';
  STEPS.forEach((_step, i) => {
    const dot = document.createElement('button');
    dot.className = 'dot';
    dot.role = 'tab';
    dot.ariaSelected = String(i === index);
    dot.ariaLabel = `Step ${i + 1} of ${STEPS.length}`;
    // Only backwards. Letting someone jump ahead past a choice they have not made yet would leave the
    // flow claiming a decision that was never taken.
    dot.disabled = i > index;
    dot.addEventListener('click', () => {
      index = i;
      render();
    });
    dots.append(dot);
  });

  $<HTMLButtonElement>('back').disabled = index === 0;

  const next = $<HTMLButtonElement>('next');
  const onImport = STEPS[index] === 'import';
  if (onImport && importState === ImportState.kSourceBusy) {
    next.textContent = loadTimeData.getString('obTryAgain');
  } else if (onImport) {
    next.textContent = importSources.length ? loadTimeData.getString('obImport') : loadTimeData.getString('obFinish');
  } else if (index === STEPS.length - 1) {
    next.textContent = loadTimeData.getString('obFinish');
  } else {
    next.textContent = loadTimeData.getString('obContinue');
  }
  next.disabled = importState === ImportState.kRunning;
}

function selectedChoice(container: HTMLElement): string {
  const checked = container.querySelector<HTMLElement>('.choice[aria-checked="true"]');
  return checked?.dataset['choice'] ?? '';
}

function wireChoiceGroup(container: HTMLElement, onPick: (choice: string) => void) {
  container.addEventListener('click', (event) => {
    const choice = (event.target as HTMLElement).closest<HTMLElement>('.choice');
    if (!choice) {
      return;
    }
    for (const other of container.querySelectorAll<HTMLElement>('.choice')) {
      other.ariaChecked = String(other === choice);
    }
    onPick(choice.dataset['choice'] ?? '');
  });
}

function describeSource(source: ImportSource): string {
  // Says only what this source actually offers. A step that promises logins it cannot bring across is
  // worse than one that admits it only brings bookmarks.
  const parts: string[] = [];
  if (source.hasBookmarks) {
    parts.push('bookmarks');
  }
  if (source.hasHistory) {
    parts.push('history');
  }
  if (source.hasPasswords) {
    parts.push(loadTimeData.getString('obImportSavedPasswords'));
  }
  if (source.hasSearchEngines) {
    parts.push(loadTimeData.getString('obImportSearchEngines'));
  }
  if (source.hasCookies) {
    parts.push(loadTimeData.getString('obImportSignedInSessions'));
  }
  return parts.length ? parts.join(', ') : loadTimeData.getString('obImportNothingReadable');
}

function renderImportSources() {
  const list = $('import-sources');
  list.textContent = '';

  if (!importSources.length) {
    $('import-detail').textContent =
        loadTimeData.getString('obImportNothingFound');
    return;
  }

  $('import-detail').textContent = loadTimeData.getString('obImportChooseSource');
  importSources.forEach((source, i) => {
    const button = document.createElement('button');
    button.className = 'choice';
    button.role = 'radio';
    button.ariaChecked = String(i === 0);
    button.dataset['choice'] = String(i);
    const name = document.createElement('strong');
    name.textContent = source.name;
    const detail = document.createElement('span');
    detail.textContent = describeSource(source);
    button.append(name, detail);
    list.append(button);
  });
  wireChoiceGroup(list, () => {});
}

function showImportStatus(state: ImportState, message: string|null) {
  importState = state;
  const status = $('import-status');
  const text = {
    [ImportState.kIdle]: '',
    [ImportState.kRunning]: 'Importing…',
    [ImportState.kSucceeded]: 'Imported.',
    [ImportState.kSourceBusy]: message ?? loadTimeData.getString('obImportSourceBusy'),
    [ImportState.kFailed]: message ?? loadTimeData.getString('obImportFailed'),
  }[state];
  status.textContent = text;
  status.hidden = !text;
  status.dataset['tone'] =
      state === ImportState.kFailed || state === ImportState.kSourceBusy ? 'error' : 'info';
  render();
}

async function main() {
  router.onImportStateChanged.addListener(showImportStatus);

  // The shortcut is the platform's, not a guess: a Mac says Command where everything else says Ctrl.
  if (navigator.platform.startsWith('Mac')) {
    $('agent-shortcut').textContent = loadTimeData.getString('obShortcutCommand');
  }

  wireChoiceGroup(
      stepEl('passwords').querySelector<HTMLElement>('.choices')!,
      (choice) => host.setPasswordChoice(choice));
  wireChoiceGroup(
      stepEl('model').querySelector<HTMLElement>('.choices')!,
      (choice) => host.setModelChoice(choice));

  $('back').addEventListener('click', () => {
    index = Math.max(0, index - 1);
    render();
  });

  $('next').addEventListener('click', () => {
    const step = STEPS[index];
    if (step !== 'import') {
      index = Math.min(STEPS.length - 1, index + 1);
      render();
      return;
    }
    if (!importSources.length || importState === ImportState.kSucceeded) {
      host.complete();
      return;
    }
    const chosen = Number(selectedChoice($('import-sources')) || '0');
    showImportStatus(ImportState.kRunning, null);
    host.startImport(chosen);
  });

  const {sources} = await host.listImportSources();
  importSources = sources;
  renderImportSources();
  render();
}

main();
