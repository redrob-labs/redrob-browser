/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Interviews (Recruit plan §3.2): the times found in the recruiter's calendar, sent to the candidate as
 * an ordinary message through the Messages queue, the candidate's pick, and booking it, which the side
 * panel does. Interviews are never recorded or analysed.
 */

import { timeZoneFor } from '@browseros/hiring/outreach'
import { formatSlot } from '@browseros/hiring/schedule'
import { getLocale, t } from '@browseros/i18n'
import { type FC, useState } from 'react'
import { toast } from 'sonner'
import { Textarea } from '@/components/ui/textarea'
import {
  type HiringInterview,
  OutreachRefused,
  type PersonOnRole,
  type Role,
  useInterviewActions,
  useInterviews,
  useMessages,
  useOutreachActions,
  usePeople,
} from '@/modules/hiring/hiring.hooks'
import { sendRefusalText } from '@/modules/hiring/labels'

const recruiterZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/** The message that offers the times: in the candidate's zone, numbered so a reply can pick one. */
export function timesMessage(
  interview: HiringInterview,
  zone: string,
  locale: string,
): string {
  return [
    t('hiringTimesMessage', interview.lengthMinutes),
    '',
    ...interview.slots.map(
      (slot, i) => `${i + 1}. ${formatSlot(slot, zone, locale)}`,
    ),
    '',
    t('hiringTimesMessageEnd'),
  ].join('\n')
}

const Interview: FC<{
  role: Role
  interview: HiringInterview
  person?: PersonOnRole
}> = ({ role, interview, person }) => {
  const actions = useInterviewActions()
  const outreach = useOutreachActions()
  const { data: queue } = useMessages(role.id)
  // The times go once: after they are in Messages (or sent), the button is gone.
  const timesAdded = (queue?.messages ?? []).some(
    (m) =>
      m.personId === interview.personId &&
      m.sequence === -1 &&
      m.createdAt >= interview.createdAt &&
      m.status !== 'not-sent' &&
      m.status !== 'stopped',
  )
  const [reply, setReply] = useState('')
  const zone = timeZoneFor(
    [person?.record.location, role.location],
    recruiterZone(),
  )
  const locale = getLocale()
  const status =
    interview.status === 'reading'
      ? t('hiringInterviewReading')
      : interview.status === 'offered'
        ? t('hiringInterviewOffered')
        : interview.status === 'chosen' &&
            interview.chosen !== null &&
            interview.slots[interview.chosen]
          ? t(
              'hiringInterviewChosen',
              formatSlot(
                interview.slots[interview.chosen] as never,
                zone,
                locale,
              ),
            )
          : interview.status === 'booking'
            ? t('hiringInterviewBooking')
            : interview.status === 'booked'
              ? t('hiringInterviewBooked')
              : t('hiringInterviewNeedsYou')
  return (
    <li className="rr-card space-y-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <b className="font-semibold text-[14px]" translate="no">
          {person?.record.name ?? ''}
        </b>
        <span className="text-[12px] text-[var(--text-secondary)]">
          <span translate="no">{interview.connector}</span> · {status}
        </span>
      </div>
      {interview.slots.length ? (
        <ol className="list-decimal space-y-1 pl-5 text-[13px]" translate="no">
          {interview.slots.map((slot, i) => (
            <li
              key={slot.start}
              className={interview.chosen === i ? 'font-semibold' : undefined}
            >
              {formatSlot(slot, zone, locale)}
            </li>
          ))}
        </ol>
      ) : null}
      {interview.status === 'offered' || interview.status === 'chosen' ? (
        <div className="space-y-2">
          <span className="flex flex-wrap items-center gap-2 text-[12px]">
            <label htmlFor={`pick-${interview.id}`}>
              {t('hiringTheyPicked')}
            </label>
            <select
              id={`pick-${interview.id}`}
              className="rr-select rr-select--sm"
              value={interview.chosen ?? ''}
              onChange={(e) =>
                e.target.value !== '' &&
                actions.choose.mutate({
                  id: interview.id,
                  index: Number(e.target.value),
                  timeZone: zone,
                })
              }
            >
              <option value="">—</option>
              {interview.slots.map((slot, i) => (
                <option key={slot.start} value={i}>
                  {i + 1}
                </option>
              ))}
            </select>
          </span>
          <Textarea
            rows={2}
            value={reply}
            placeholder={t('hiringPickFromReply')}
            aria-label={t('hiringPickFromReply')}
            onChange={(e) => setReply(e.target.value)}
            onBlur={() =>
              reply.trim() &&
              actions.choose.mutate(
                { id: interview.id, reply, timeZone: zone },
                {
                  onSuccess: ({ interview: next }) =>
                    next ? setReply('') : toast(t('hiringPickUnclear')),
                },
              )
            }
          />
        </div>
      ) : null}
      <footer className="flex flex-wrap justify-end gap-2">
        {interview.status !== 'booking' ? (
          <button
            type="button"
            className="rr-btn rr-btn--ghost rr-btn--sm"
            onClick={() => actions.cancel.mutate(interview.id)}
          >
            {t('hiringCancelInterview')}
          </button>
        ) : null}
        {interview.status === 'offered' && person && !timesAdded ? (
          <button
            type="button"
            className="rr-btn rr-btn--secondary rr-btn--sm"
            onClick={() =>
              // A reply goes back on the channel of the last message: the same mailbox, or the site.
              void outreach.draft
                .mutateAsync({
                  roleId: role.id,
                  personId: person.id,
                  notice: '',
                  language: locale,
                  reply: true,
                  body: timesMessage(interview, zone, locale),
                })
                .then(() => toast.success(t('hiringDrafted')))
                .catch((error: Error) =>
                  toast.error(
                    t(
                      'hiringRefusedSend',
                      sendRefusalText(
                        error instanceof OutreachRefused
                          ? error.code
                          : 'needs-you',
                      ),
                    ),
                  ),
                )
            }
          >
            {t('hiringAddTimes')}
          </button>
        ) : null}
      </footer>
    </li>
  )
}

export const InterviewsTab: FC<{ role: Role }> = ({ role }) => {
  const { data: interviews = [] } = useInterviews(role.id)
  const { data: people = [] } = usePeople(role.id)
  const open = interviews.filter((i) => i.status !== 'cancelled')
  if (!open.length) {
    return (
      <div className="rr-empty rr-empty--compact">
        <p className="rr-empty__desc">{t('hiringInterviewsEmpty')}</p>
      </div>
    )
  }
  return (
    <ul className="space-y-3">
      {open.map((interview) => (
        <Interview
          key={interview.id}
          role={role}
          interview={interview}
          person={people.find((p) => p.id === interview.personId)}
        />
      ))}
    </ul>
  )
}
