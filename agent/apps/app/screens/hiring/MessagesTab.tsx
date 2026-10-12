/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Messages to send (Recruit plan §3.2): each draft with why this person, the exact text, and the
 * design system's ApprovalStep shape, where Don't send is as large as Send. Approved messages are sent
 * from the side panel, one per run, where the recruiter can watch; below, today's counts against the
 * caps and the receipts of what was sent.
 */

import { type SiteId, siteById } from '@browseros/hiring/sites'
import { formatRelative, t } from '@browseros/i18n'
import { type FC, useState } from 'react'
import { toast } from 'sonner'
import { Textarea } from '@/components/ui/textarea'
import {
  type HiringMessage,
  OutreachRefused,
  type PersonOnRole,
  type Role,
  useMessages,
  useOutreachActions,
  usePeople,
} from '@/modules/hiring/hiring.hooks'
import { sendRefusalText } from '@/modules/hiring/labels'

const siteName = (id: string) => {
  try {
    return siteById(id as SiteId).name
  } catch {
    return id
  }
}

const Draft: FC<{ message: HiringMessage; person?: PersonOnRole }> = ({
  message,
  person,
}) => {
  const actions = useOutreachActions()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(message.body)
  const refuse = (error: Error) =>
    toast.error(
      t(
        'hiringRefusedSend',
        sendRefusalText(
          error instanceof OutreachRefused ? error.code : 'needs-you',
        ),
      ),
    )
  return (
    <li className="rr-card space-y-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span>
          <b className="font-semibold text-[14px]" translate="no">
            {person?.record.name ?? ''}
          </b>
          <span className="ml-2 text-[13px] text-[var(--text-secondary)]">
            <span translate="no">
              {message.channel === 'email'
                ? `${t('hiringEmailLabel')} · ${message.recipient ?? ''}`
                : siteName(message.channel)}
            </span>{' '}
            ·{' '}
            {message.sequence
              ? t('hiringFollowUpLabel', message.sequence)
              : t('hiringFirstMessage')}
          </span>
        </span>
        {person?.evaluation?.judged ? (
          <span className="text-[12px] text-[var(--text-tertiary)]">
            {t('hiringWhy', person.evaluation.met, person.evaluation.judged)}
          </span>
        ) : null}
      </div>
      {editing ? (
        <Textarea
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label={t('hiringEdit')}
        />
      ) : (
        <p
          className="whitespace-pre-wrap rounded-[var(--radius-md)] bg-[var(--surface-sunken)] p-3 text-[13px]"
          translate="no"
        >
          {message.body}
        </p>
      )}
      {message.note ? (
        <p className="text-[12px] text-[var(--text-secondary)]">
          {t('hiringRefusedSend', sendRefusalText(message.note))}
        </p>
      ) : null}
      {message.status === 'approved' ? (
        <p className="text-[12px] text-[var(--text-secondary)]">
          {message.approvedBy === 'redrob:automatic'
            ? t('hiringApprovedByRedrob')
            : t('hiringApprovedWaiting')}
        </p>
      ) : message.status === 'sending' ? (
        <p className="text-[12px] text-[var(--text-secondary)]">
          {t('hiringSending')}
        </p>
      ) : null}
      <footer className="flex flex-wrap justify-end gap-2">
        {editing ? (
          <button
            type="button"
            className="rr-btn rr-btn--secondary rr-btn--sm"
            onClick={() =>
              actions.update.mutate(
                { id: message.id, body: text },
                { onSuccess: () => setEditing(false), onError: refuse },
              )
            }
          >
            {t('hiringSaveText')}
          </button>
        ) : message.status !== 'sending' ? (
          <button
            type="button"
            className="rr-btn rr-btn--ghost rr-btn--sm"
            onClick={() => setEditing(true)}
          >
            {t('hiringEdit')}
          </button>
        ) : null}
        {message.status !== 'sending' ? (
          <button
            type="button"
            className="rr-btn rr-btn--secondary rr-btn--md"
            onClick={() =>
              actions.update.mutate(
                { id: message.id, status: 'not-sent' },
                { onError: refuse },
              )
            }
          >
            {t('hiringDontSend')}
          </button>
        ) : null}
        {message.status === 'draft' && !editing ? (
          <button
            type="button"
            className="rr-btn rr-btn--primary rr-btn--md"
            onClick={() =>
              actions.update.mutate(
                { id: message.id, status: 'approved' },
                { onError: refuse },
              )
            }
          >
            {t('hiringSendThis')}
          </button>
        ) : null}
      </footer>
    </li>
  )
}

export const MessagesTab: FC<{ role: Role }> = ({ role }) => {
  const { data } = useMessages(role.id)
  const { data: people = [] } = usePeople(role.id)
  const actions = useOutreachActions()
  const messages = data?.messages ?? []
  const queue = messages.filter((m) =>
    ['draft', 'approved', 'sending'].includes(m.status),
  )
  const drafts = queue.filter((m) => m.status === 'draft')
  const sent = messages.filter((m) => m.status === 'sent')
  const personOf = (id: string) => people.find((p) => p.id === id)
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-[15px]">
          {t('hiringMessagesTitle', queue.length)}
        </h2>
        {drafts.length > 1 ? (
          <button
            type="button"
            className="rr-btn rr-btn--primary rr-btn--sm"
            onClick={() => actions.approve.mutate(drafts.map((m) => m.id))}
          >
            {t('hiringApproveAll', drafts.length)}
          </button>
        ) : null}
      </div>
      {queue.length ? (
        <ul className="space-y-3">
          {queue.map((m) => (
            <Draft key={m.id} message={m} person={personOf(m.personId)} />
          ))}
        </ul>
      ) : (
        <div className="rr-empty rr-empty--compact">
          <p className="rr-empty__desc">{t('hiringMessagesEmpty')}</p>
        </div>
      )}
      <p className="text-[12px] text-[var(--text-tertiary)]">
        {data?.today.length
          ? t(
              'hiringToday',
              data.today
                .map((d) =>
                  t('hiringTodayItem', siteName(d.channel), d.sent, d.cap),
                )
                .join(' · '),
            )
          : null}
        {data?.today.length ? ' · ' : null}
        {t('hiringQuietHours')}
      </p>
      {sent.length ? (
        <section className="space-y-2">
          <h3 className="font-medium text-[13px]">{t('hiringSentList')}</h3>
          <ul className="space-y-2">
            {[...sent].reverse().map((m) => (
              <li key={m.id} className="rr-card space-y-1 p-3 text-[13px]">
                <span className="flex justify-between gap-2">
                  <b translate="no">
                    {personOf(m.personId)?.record.name ?? ''}
                  </b>
                  <span className="text-[12px] text-[var(--text-tertiary)]">
                    {t('hiringSentAt', formatRelative(m.sentAt ?? m.updatedAt))}
                  </span>
                </span>
                <p
                  className="whitespace-pre-wrap text-[var(--text-secondary)]"
                  translate="no"
                >
                  {m.body}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
