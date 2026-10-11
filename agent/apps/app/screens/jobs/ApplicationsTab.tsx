/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The tracker: every application with its status in words, what needs the person first, and the
 * receipt of what was sent. Shortlisted jobs are approved together here and run in the side panel.
 */

import { formatRelative, t } from '@browseros/i18n'
import { ExternalLink, Trash2 } from '@browseros/icons'
import type { Application } from '@browseros/jobs/applications'
import type { JobProfile } from '@browseros/jobs/profile'
import { type FC, useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { approvedBatchStorage } from '@/lib/jobs/jobStorage'
import { useJobActions } from '@/modules/jobs/jobs.hooks'
import {
  STATUS_LABEL,
  STATUS_TONE,
  sortApplications,
} from '@/modules/jobs/labels'

const Receipt: FC<{ application: Application; baseUrl?: string }> = ({
  application,
  baseUrl,
}) => {
  const receipt = application.receipt
  if (!receipt) return null
  return (
    <div className="mt-3 space-y-2 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] p-3 text-[12px]">
      <div className="font-medium">
        {t('jobsReceiptSentAt', formatRelative(receipt.sentAt))}
      </div>
      <div className="text-[var(--text-secondary)]">
        {t('jobsReceiptFields')}
      </div>
      {receipt.fields.length ? (
        <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-3 gap-y-1">
          {receipt.fields.map((f) => (
            <div key={f.field} className="contents">
              <dt className="truncate text-[var(--text-secondary)]">
                {f.field}
              </dt>
              <dd className="truncate">{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-[var(--text-tertiary)]">
          {t('jobsReceiptNoFields')}
        </p>
      )}
      {receipt.screenshot && baseUrl ? (
        <a
          className="rr-btn rr-btn--ghost rr-btn--sm -ml-2"
          href={`${baseUrl}/jobs/applications/${application.id}/receipt.png`}
          target="_blank"
          rel="noreferrer"
        >
          {t('jobsReceiptScreenshot')}
        </a>
      ) : null}
    </div>
  )
}

export const ApplicationsTab: FC<{
  applications: Application[]
  profile: JobProfile
}> = ({ applications, profile }) => {
  const actions = useJobActions()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openReceipt, setOpenReceipt] = useState<string | null>(null)
  const sorted = sortApplications(applications)
  const queued = sorted.filter((a) => a.status === 'queued')

  if (!applications.length) {
    return (
      <div className="rr-empty rr-empty--compact">
        <p className="rr-empty__desc">{t('jobsAppsEmpty')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {queued.length ? (
        <div className="rr-card flex items-center justify-between gap-3 p-3">
          <p className="text-[13px] text-[var(--text-secondary)]">
            {t('jobsApproveHint')}
          </p>
          <button
            type="button"
            className="rr-btn rr-btn--primary rr-btn--sm shrink-0"
            disabled={selected.size === 0}
            onClick={() => {
              void approvedBatchStorage.setValue({
                ids: queued.filter((a) => selected.has(a.id)).map((a) => a.id),
                mode: profile.mode === 'automatic' ? 'automatic' : 'batch',
                next: 0,
                sent: 0,
              })
              setSelected(new Set())
            }}
          >
            {t('jobsApprove', selected.size)}
          </button>
        </div>
      ) : null}
      <ul className="space-y-2">
        {sorted.map((application) => {
          const { posting, status } = application
          const pending = status === 'ready' || status === 'needs-you'
          return (
            <li key={application.id} className="rr-card p-4">
              <div className="flex items-start gap-3">
                {status === 'queued' ? (
                  <Checkbox
                    className="mt-1"
                    aria-label={posting.title}
                    checked={selected.has(application.id)}
                    onCheckedChange={(on) =>
                      setSelected((s) => {
                        const next = new Set(s)
                        if (on) next.add(application.id)
                        else next.delete(application.id)
                        return next
                      })
                    }
                  />
                ) : null}
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <b className="font-semibold text-[15px]">{posting.title}</b>
                    <span
                      className={`rr-badge rr-badge--sm ${STATUS_TONE[status]}`}
                    >
                      {t(STATUS_LABEL[status])}
                    </span>
                  </span>
                  <span className="block text-[13px] text-[var(--text-secondary)]">
                    {[posting.company, posting.location]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  {application.note ? (
                    <span className="block text-[12px]">
                      {application.note}
                    </span>
                  ) : null}
                  <span className="block text-[12px] text-[var(--text-tertiary)]">
                    {formatRelative(application.updatedAt)}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {pending ? (
                    <button
                      type="button"
                      className="rr-btn rr-btn--secondary rr-btn--sm"
                      onClick={() =>
                        actions.update.mutate({
                          id: application.id,
                          status: 'sent',
                        })
                      }
                    >
                      {t('jobsMarkSent')}
                    </button>
                  ) : null}
                  {status === 'queued' || pending ? (
                    <button
                      type="button"
                      className="rr-btn rr-btn--ghost rr-btn--sm"
                      onClick={() =>
                        actions.update.mutate({
                          id: application.id,
                          status: 'skipped',
                        })
                      }
                    >
                      {t('jobsSkip')}
                    </button>
                  ) : null}
                  {application.receipt ? (
                    <button
                      type="button"
                      className="rr-btn rr-btn--ghost rr-btn--sm"
                      aria-expanded={openReceipt === application.id}
                      onClick={() =>
                        setOpenReceipt((o) =>
                          o === application.id ? null : application.id,
                        )
                      }
                    >
                      {t('jobsReceipt')}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="rr-iconbtn rr-iconbtn--sm"
                    aria-label={t('jobsOpenPosting')}
                    title={t('jobsOpenPosting')}
                    onClick={() =>
                      void chrome.tabs.create({ url: posting.url })
                    }
                  >
                    <ExternalLink className="size-[14px]" />
                  </button>
                  <button
                    type="button"
                    className="rr-iconbtn rr-iconbtn--sm"
                    aria-label={t('jobsRemove')}
                    title={t('jobsRemove')}
                    onClick={() => {
                      if (window.confirm(t('jobsDeleteConfirm', posting.title)))
                        actions.remove.mutate(application.id)
                    }}
                  >
                    <Trash2 className="size-[14px]" />
                  </button>
                </span>
              </div>
              {openReceipt === application.id ? (
                <Receipt application={application} baseUrl={actions.baseUrl} />
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
