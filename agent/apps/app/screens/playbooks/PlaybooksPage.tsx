/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Playbooks: the tasks taught to Redrob, on this computer. Each row says how much runs without asking
 * (the design system's PlaybookRow rule: the count is derived from the steps). A playbook someone
 * shared is shown in full, with its sites and stops, before it can be saved.
 */

import { formatRelative, t, tCount } from '@browseros/i18n'
import { Download, Play, Trash2, Upload } from '@browseros/icons'
import {
  normalisePlaybook,
  type Playbook,
  validatePlaybook,
} from '@browseros/playbooks/playbook'
import { type ChangeEvent, type FC, useRef, useState } from 'react'
import { toast } from 'sonner'
import { listOf, PlaybookView } from '@/components/playbooks/PlaybookView'
import {
  usePlaybookActions,
  usePlaybooks,
} from '@/modules/playbooks/playbooks.hooks'

function download(playbook: Playbook) {
  const { runs: _r, lastRunAt: _l, ...shared } = playbook
  const blob = new Blob([JSON.stringify({ ...shared, runs: 0 }, null, 2)], {
    type: 'application/json',
  })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${playbook.name.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase() || 'playbook'}.redrob-playbook.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

/** Parses a shared file. Returns the playbook, normalised so it cannot drop a stop, or why it is refused. */
export function readShared(text: string, now: number): Playbook | string {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return 'not JSON'
  }
  const problem = validatePlaybook(value)
  if (problem) return problem
  return normalisePlaybook({
    ...(value as Playbook),
    id: crypto.randomUUID(),
    runs: 0,
    lastRunAt: undefined,
    createdAt: now,
    updatedAt: now,
  })
}

export const PlaybooksPage: FC = () => {
  const { data: playbooks = [] } = usePlaybooks()
  const { save, remove } = usePlaybookActions()
  const [review, setReview] = useState<Playbook | null>(null)
  const file = useRef<HTMLInputElement>(null)

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0]
    event.target.value = ''
    if (!chosen) return
    const result = readShared(await chosen.text(), Date.now())
    if (typeof result === 'string')
      toast.error(t('playbooksImportFailed', result))
    else setReview(result)
  }

  return (
    <div className="fade-in slide-in-from-bottom-5 mx-auto max-w-3xl animate-in space-y-6 p-6 duration-500">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-semibold text-xl">{t('playbooksTitle')}</h1>
          <p className="text-[13px] text-[var(--text-secondary)]">
            {t('playbooksLede')}
          </p>
        </div>
        <button
          type="button"
          className="rr-btn rr-btn--secondary rr-btn--sm shrink-0"
          onClick={() => file.current?.click()}
        >
          <Upload className="size-[14px]" />
          {t('playbooksImport')}
        </button>
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={onFile}
        />
      </header>

      {review ? (
        <section className="space-y-2">
          <p className="text-[13px]">
            {t(
              'playbooksImportReview',
              listOf(review.sites),
              review.steps.filter((s) => s.stop).length,
            )}
          </p>
          <PlaybookView
            playbook={review}
            actions={
              <>
                <button
                  type="button"
                  className="rr-btn rr-btn--ghost rr-btn--sm"
                  onClick={() => setReview(null)}
                >
                  {t('playbookRunCancel')}
                </button>
                <button
                  type="button"
                  className="rr-btn rr-btn--primary rr-btn--sm"
                  onClick={() =>
                    save.mutate(review, { onSuccess: () => setReview(null) })
                  }
                >
                  {t('playbookSave')}
                </button>
              </>
            }
          />
        </section>
      ) : null}

      {playbooks.length === 0 && !review ? (
        <div className="rr-empty rr-empty--compact">
          <p className="rr-empty__desc">{t('playbooksEmpty')}</p>
        </div>
      ) : null}

      <ul className="space-y-2">
        {playbooks.map((playbook) => {
          const stops = playbook.steps.filter((s) => s.stop).length
          return (
            <li
              key={playbook.id}
              className="rr-card flex items-start justify-between gap-4 p-4"
            >
              <span className="min-w-0 flex-1 space-y-1">
                <span className="block font-semibold text-[15px]">
                  <b>{playbook.name}</b>
                </span>
                <span className="block text-[13px] text-[var(--text-secondary)]">
                  {playbook.purpose}
                </span>
                <span className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-[var(--text-tertiary)]">
                  <span className="text-[var(--text-secondary)]">
                    {stops === 0
                      ? t('playbookStraight')
                      : stops === 1
                        ? t('playbookStopsOne')
                        : t('playbookStopsOther', stops)}
                  </span>
                  <span>{tCount('playbookSteps', playbook.steps.length)}</span>
                  {playbook.runs ? (
                    <span>{tCount('playbookRuns', playbook.runs)}</span>
                  ) : null}
                  {playbook.lastRunAt ? (
                    <span>
                      {t('playbookLastRun', formatRelative(playbook.lastRunAt))}
                    </span>
                  ) : null}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  className="rr-btn rr-btn--secondary rr-btn--sm"
                  onClick={() => {
                    const url = playbook.steps.find((s) => s.hint?.url)?.hint
                      ?.url
                    if (url) void chrome.tabs.create({ url })
                  }}
                >
                  <Play className="size-[14px]" />
                  {t('playbooksOpen')}
                </button>
                <button
                  type="button"
                  className="rr-iconbtn rr-iconbtn--sm"
                  aria-label={t('playbooksExport')}
                  title={t('playbooksExport')}
                  onClick={() => download(playbook)}
                >
                  <Download className="size-[14px]" />
                </button>
                <button
                  type="button"
                  className="rr-iconbtn rr-iconbtn--sm"
                  aria-label={t('playbooksDelete')}
                  title={t('playbooksDelete')}
                  onClick={() => {
                    if (
                      window.confirm(t('playbooksDeleteConfirm', playbook.name))
                    )
                      remove.mutate(playbook.id)
                  }}
                >
                  <Trash2 className="size-[14px]" />
                </button>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
