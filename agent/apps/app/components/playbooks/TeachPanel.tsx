/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Teach Mode in the side panel: while recording, what has been understood so far (as the steps the
 * draft will have, not as raw clicks); then the draft playbook to name, check and save.
 */

import { t, tCount } from '@browseros/i18n'
import type { Playbook } from '@browseros/playbooks/playbook'
import { draftFromEvents, type TeachEvent } from '@browseros/playbooks/teach'
import { type FC, useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import type { PlaybookPanel } from '@/modules/playbooks/panel.hooks'
import { draftPhrases } from '@/modules/playbooks/phrases'
import { usePlaybookActions } from '@/modules/playbooks/playbooks.hooks'
import { PlaybookView, stepText } from './PlaybookView'

export const TeachRecording: FC<{
  events: TeachEvent[]
  paused: boolean
  onPause: (paused: boolean) => void
  onDiscard: () => void
  onDone: () => void
}> = ({ events, paused, onPause, onDiscard, onDone }) => {
  const preview = draftFromEvents(events, {
    id: 'preview',
    now: 0,
    phrases: draftPhrases(),
  })
  return (
    <section
      className="rr-card space-y-3 border-[var(--status-danger)] p-4"
      aria-live="polite"
    >
      <header className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`size-2.5 rounded-full ${paused ? 'bg-[var(--text-tertiary)]' : 'animate-pulse bg-[var(--status-danger)]'}`}
        />
        <h2 className="font-semibold text-[14px]">{t('teachTitle')}</h2>
        <span className="ml-auto text-[12px] text-[var(--text-secondary)]">
          {tCount('teachStepCount', preview.steps.length)}
        </span>
      </header>
      <p className="text-[13px] text-[var(--text-secondary)]">
        {paused ? t('teachPaused') : t('teachLede')}
      </p>
      {preview.steps.length ? (
        <ol className="max-h-56 space-y-1 overflow-y-auto text-[13px]">
          {preview.steps.slice(-8).map((step, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a live, append-only list.
            <li key={index} className="flex gap-2">
              <span className="text-[var(--text-tertiary)]">
                {preview.steps.length -
                  Math.min(8, preview.steps.length) +
                  index +
                  1}
              </span>
              <span>{stepText(preview, step.intent)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-[13px] text-[var(--text-tertiary)]">
          {t('teachEmpty')}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="rr-btn rr-btn--ghost rr-btn--sm"
          onClick={() => onPause(!paused)}
        >
          {paused ? t('teachResume') : t('teachPause')}
        </button>
        <button
          type="button"
          className="rr-btn rr-btn--secondary rr-btn--sm"
          onClick={onDiscard}
        >
          {t('teachDiscard')}
        </button>
        <button
          type="button"
          className="rr-btn rr-btn--primary rr-btn--sm"
          disabled={preview.steps.length === 0}
          onClick={onDone}
        >
          {t('teachDone')}
        </button>
      </div>
    </section>
  )
}

const PlaybookDraft: FC<{
  draft: Playbook
  onSaved: (playbook: Playbook) => void
  onTry: (playbook: Playbook) => void
  onDiscard: () => void
}> = ({ draft, onSaved, onTry, onDiscard }) => {
  const { save } = usePlaybookActions()
  const [name, setName] = useState(draft.name)
  const [purpose, setPurpose] = useState(draft.purpose)
  const current = { ...draft, name: name.trim() || draft.name, purpose }
  const store = (then: (p: Playbook) => void) =>
    save.mutate(current, {
      onSuccess: (saved) => {
        toast.success(t('playbookSaved'))
        then(saved)
      },
      onError: (error) => toast.error(error.message),
    })
  return (
    <PlaybookView
      playbook={current}
      head={
        <span className="block space-y-2">
          <span className="flex items-center gap-2">
            <span className="rr-badge rr-badge--subtle rr-badge--neutral rr-badge--sm">
              {t('playbookDraft')}
            </span>
          </span>
          <Input
            aria-label={t('playbookNameLabel')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            aria-label={t('playbookPurposeLabel')}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
          />
        </span>
      }
      actions={
        <>
          <button
            type="button"
            className="rr-btn rr-btn--ghost rr-btn--sm"
            onClick={onDiscard}
          >
            {t('teachDiscard')}
          </button>
          <button
            type="button"
            className="rr-btn rr-btn--secondary rr-btn--sm"
            disabled={save.isPending}
            onClick={() => store(onTry)}
          >
            {t('playbookTry')}
          </button>
          <button
            type="button"
            className="rr-btn rr-btn--primary rr-btn--sm"
            disabled={save.isPending}
            onClick={() => store(onSaved)}
          >
            {t('playbookSave')}
          </button>
        </>
      }
    />
  )
}

/** Before a run: the playbook's inputs, prefilled with what was typed when it was taught. */
const PlaybookRunForm: FC<{
  playbook: Playbook
  busy?: boolean
  onStart: (values: Record<string, string>) => void
  onCancel: () => void
}> = ({ playbook, busy, onStart, onCancel }) => {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(playbook.inputs.map((i) => [i.id, i.example ?? ''])),
  )
  return (
    <PlaybookView
      playbook={playbook}
      head={
        <span className="block space-y-2">
          <span className="rr-playbook__name">
            {t('playbookRunTitle', playbook.name)}
          </span>
          {playbook.inputs.map((input) => (
            <span key={input.id} className="block space-y-1 text-[13px]">
              <label htmlFor={`pb-input-${input.id}`}>{input.label}</label>
              <Input
                id={`pb-input-${input.id}`}
                value={values[input.id] ?? ''}
                onChange={(e) =>
                  setValues({ ...values, [input.id]: e.target.value })
                }
              />
            </span>
          ))}
        </span>
      }
      actions={
        <>
          <button
            type="button"
            className="rr-btn rr-btn--ghost rr-btn--sm"
            onClick={onCancel}
          >
            {t('playbookRunCancel')}
          </button>
          <button
            type="button"
            className="rr-btn rr-btn--primary rr-btn--sm"
            disabled={busy}
            onClick={() => onStart(values)}
          >
            {t('playbookRunStart')}
          </button>
        </>
      }
    />
  )
}

/** Whichever of recording, draft or run form is in progress, in the conversation area. */
export const PlaybookPanels: FC<{ panel: PlaybookPanel }> = ({ panel }) => {
  const { teaching, draft, running } = panel
  if (teaching.session) {
    return (
      <TeachRecording
        events={teaching.events}
        paused={teaching.session.paused}
        onPause={(paused) => void teaching.setPaused(paused)}
        onDiscard={() => void teaching.finish()}
        onDone={() => void panel.finishTeaching()}
      />
    )
  }
  if (draft) {
    return (
      <PlaybookDraft
        draft={draft}
        onDiscard={() => panel.setDraft(null)}
        onSaved={() => panel.setDraft(null)}
        onTry={(saved) => {
          panel.setDraft(null)
          panel.setRunning(saved)
        }}
      />
    )
  }
  if (running) {
    return (
      <PlaybookRunForm
        playbook={running}
        busy={panel.starting}
        onCancel={() => panel.setRunning(null)}
        onStart={(values) => panel.startRun(running, values)}
      />
    )
  }
  return null
}
