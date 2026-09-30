// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// First, before anything that can paint. See theme.ts.
import './theme.js';

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

// -1 so the first render counts as a step change and the welcome step gets the keyboard.
let focusedStep = -1;

// The import chooser's container listeners are installed once; its buttons are rebuilt per render.
let importChoicesWired = false;
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
    // The only string in this flow that was written in code rather than taken from the dictionary, so a
    // Korean first run announced its progress in English. getStringF because the numbers move.
    dot.ariaLabel = loadTimeData.getStringF('obStepOf', i + 1, STEPS.length);
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

  // Where the keyboard lands when a step draws. Nothing was focused before, so the first Tab started from
  // the top of the document and the step's own controls were several stops away. A step with a chooser
  // starts on the chosen option, since arrows are what that step is for; a step without one starts on the
  // action, because continuing is the only thing to do there.
  //
  // Guarded on the step CHANGING, not on every render: render() also runs when the import state moves, and
  // focusing there would snatch the keyboard back to Continue while someone was still choosing a source.
  if (focusedStep !== index) {
    focusedStep = index;
    const chosen = stepEl(STEPS[index]!).querySelector<HTMLElement>('.choice[aria-checked="true"]');
    (chosen ?? next).focus();
  }
}

function selectedChoice(container: HTMLElement): string {
  const checked = container.querySelector<HTMLElement>('.choice[aria-checked="true"]');
  return checked?.dataset['choice'] ?? '';
}

function wireChoiceGroup(container: HTMLElement, onPick: (choice: string) => void) {
  const choices = () => [...container.querySelectorAll<HTMLElement>('.choice')];
  // A radiogroup is ONE tab stop: only the checked option is tabbable and the arrows move between the
  // rest. This group already announced itself correctly with role=radio and aria-checked, but every
  // option was individually tabbable and the arrow keys did nothing -- so the semantics promised a
  // radiogroup and the keyboard delivered a row of buttons.
  const paint = (picked: HTMLElement) => {
    for (const other of choices()) {
      const on = other === picked;
      other.ariaChecked = String(on);
      other.tabIndex = on ? 0 : -1;
    }
  };
  const initial = choices().find((choice) => choice.ariaChecked === 'true');
  if (initial) {
    paint(initial);
  }

  container.addEventListener('click', (event) => {
    const choice = (event.target as HTMLElement).closest<HTMLElement>('.choice');
    if (!choice) {
      return;
    }
    paint(choice);
    onPick(choice.dataset['choice'] ?? '');
  });

  container.addEventListener('keydown', (event: KeyboardEvent) => {
    const all = choices();
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
               : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1
                                                                     : 0;
    const from = all.findIndex((choice) => choice === document.activeElement);
    let next = -1;
    if (step !== 0 && from !== -1) {
      next = (from + step + all.length) % all.length;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = all.length - 1;
    }
    if (next === -1) {
      return;
    }
    // Otherwise the arrows scroll the step under the group.
    event.preventDefault();
    const target = all[next]!;
    target.focus();
    // Moving to an option selects it: that is the radiogroup pattern, not an extra keypress.
    paint(target);
    onPick(target.dataset['choice'] ?? '');
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
  // Wired once, not per render. This function runs again whenever the import state changes, and
  // wireChoiceGroup adds listeners to the CONTAINER -- so re-wiring stacked a click and a keydown handler
  // per render, and a single arrow key then moved focus once for every render that had happened.
  if (!importChoicesWired) {
    importChoicesWired = true;
    wireChoiceGroup(list, () => {});
  }
}

function showImportStatus(state: ImportState, message: string|null) {
  importState = state;
  const status = $('import-status');
  const text = {
    [ImportState.kIdle]: '',
    // These two were English literals while the two below them came from the dictionary, so a Korean
    // first run reported its own progress in English -- the same split the stores had before their
    // strings were moved out, and the same one the routine form had with a literal "Added.".
    [ImportState.kRunning]: loadTimeData.getString('obImportRunning'),
    [ImportState.kSucceeded]: loadTimeData.getString('obImportDone'),
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

  // Enter moves the flow forward, on every step. Nothing handled it before and nothing was focused when a
  // step drew, so a keyboard user pressed Enter and the flow sat still -- on the one surface a new user
  // cannot skip, whose whole job is to walk them through.
  //
  // It advances from inside a choice group too, which is safe because selection FOLLOWS FOCUS there: by
  // the time someone has arrowed to an option it is already chosen, so Enter is unambiguously "and now
  // continue". Only Back is excluded, so Enter on it goes back rather than forward.
  document.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.defaultPrevented) {
      return;
    }
    if ((event.target as HTMLElement|null)?.id === 'back') {
      return;
    }
    event.preventDefault();
    $<HTMLButtonElement>('next').click();
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
