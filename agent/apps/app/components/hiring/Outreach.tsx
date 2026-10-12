/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The outreach controls on a person and on a role: write a message (Redrob drafts it, or the recruiter
 * writes it when no AI can), record a reply, offer interview times, and choose how much Redrob does
 * on the role.
 */

import { automaticAllowed } from '@browseros/hiring/outreach'
import { type SiteId, siteById } from '@browseros/hiring/sites'
import { getLocale, t } from '@browseros/i18n'
import { type FC, useState } from 'react'
import { toast } from 'sonner'
import { Textarea } from '@/components/ui/textarea'
import { timesRequestStorage } from '@/lib/hiring/hiringStorage'
import {
  type PersonOnRole,
  type Role,
  useHiringPolicy,
  useInterviews,
  useOutreachActions,
} from '@/modules/hiring/hiring.hooks'
import { screenProblem } from '@/modules/hiring/labels'
import { useGetUserMCPIntegrations } from '@/modules/mcp/user-integrations.hooks'

type Mailbox = 'Gmail' | 'Outlook Mail'

/** How a message can go: the site's own channel, or email from a connected mailbox to a published address. */
function useChannels(person: PersonOnRole) {
  const { data: integrations } = useGetUserMCPIntegrations()
  let site: string = person.record.site
  let siteCarries = false
  let ats = false
  try {
    const found = siteById(person.record.site as SiteId)
    site = found.name
    siteCarries = found.send !== 'none'
    ats = Boolean(found.ats)
  } catch {}
  const mailboxes = (['Gmail', 'Outlook Mail'] as const).filter((name) =>
    integrations?.integrations.some(
      (i) => i.name === name && i.is_authenticated,
    ),
  )
  // Only an address the person published or applied with.
  const address = person.record.contact.find(
    (c) => c.kind === 'email' && c.value,
  )?.value
  const options: Array<{ id: 'site' | Mailbox; label: string }> = [
    ...(siteCarries
      ? [{ id: 'site' as const, label: t('hiringViaSite', site) }]
      : []),
    ...(address
      ? mailboxes.map((m) => ({
          id: m,
          label: t('hiringViaEmail', m === 'Gmail' ? 'Gmail' : 'Outlook'),
        }))
      : []),
  ]
  return { site, ats, address, mailboxes, options }
}

export const WriteMessage: FC<{
  role: Role
  person: PersonOnRole
  sequence?: number
}> = ({ role, person, sequence = 0 }) => {
  const actions = useOutreachActions()
  const [own, setOwn] = useState<{ reason: string; text: string } | null>(null)
  const { site, ats, address, mailboxes, options } = useChannels(person)
  const [via, setVia] = useState<string>('site')
  const chosen = options.find((o) => o.id === via)?.id ?? options[0]?.id
  const email =
    chosen && chosen !== 'site' && address
      ? { connector: chosen, recipient: address }
      : undefined
  const base = {
    roleId: role.id,
    personId: person.id,
    notice: email
      ? t(
          'hiringNoticeEmail',
          ats
            ? t('hiringNoticeEmailApplied')
            : t('hiringNoticeEmailGave', site),
        )
      : t('hiringNotice', site),
    language: getLocale(),
    sequence,
    email,
  }
  if (!options.length) {
    return address && !mailboxes.length ? (
      <span className="text-[12px] text-[var(--text-tertiary)]">
        {t('hiringConnectMailbox')}
      </span>
    ) : null
  }
  const picker =
    options.length > 1 ? (
      <span className="flex flex-wrap items-center gap-2 text-[12px]">
        <label htmlFor={`via-${person.id}`}>{t('hiringSendVia')}</label>
        <select
          id={`via-${person.id}`}
          className="rr-select rr-select--sm"
          value={chosen}
          onChange={(e) => setVia(e.target.value)}
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        {email ? (
          <span className="text-[var(--text-tertiary)]">
            {t('hiringViaEmailHint', email.recipient)}
          </span>
        ) : null}
      </span>
    ) : null
  if (own) {
    return (
      <div className="w-full space-y-2">
        {picker}
        <p className="text-[12px] text-[var(--text-secondary)]">
          {t('hiringWriteYourself', own.reason)}
        </p>
        <Textarea
          rows={5}
          value={own.text}
          onChange={(e) => setOwn({ ...own, text: e.target.value })}
          aria-label={t('hiringWrite')}
        />
        <span className="flex justify-end">
          <button
            type="button"
            className="rr-btn rr-btn--secondary rr-btn--sm"
            disabled={!own.text.trim()}
            onClick={() =>
              actions.draft.mutate(
                { ...base, body: own.text },
                {
                  onSuccess: () => {
                    setOwn(null)
                    toast.success(t('hiringDrafted'))
                  },
                },
              )
            }
          >
            {t('hiringWriteSave')}
          </button>
        </span>
      </div>
    )
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      {picker}
      <button
        type="button"
        className="rr-btn rr-btn--secondary rr-btn--sm"
        disabled={actions.draft.isPending}
        aria-busy={actions.draft.isPending}
        onClick={() =>
          actions.draft.mutate(base, {
            onSuccess: (out) => {
              if (out.status === 'drafted') toast.success(t('hiringDrafted'))
              else setOwn({ reason: screenProblem(out.reason), text: '' })
            },
          })
        }
      >
        {actions.draft.isPending
          ? t('hiringWriting')
          : sequence
            ? t('hiringWriteFollowUp')
            : t('hiringWrite')}
      </button>
    </span>
  )
}

export const RecordReply: FC<{ role: Role; person: PersonOnRole }> = ({
  role,
  person,
}) => {
  const actions = useOutreachActions()
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  if (!open) {
    return (
      <button
        type="button"
        className="rr-btn rr-btn--ghost rr-btn--sm"
        onClick={() => setOpen(true)}
      >
        {t('hiringReplied')}
      </button>
    )
  }
  return (
    <div className="w-full space-y-2">
      <p className="text-[12px] text-[var(--text-secondary)]">
        {t('hiringReplyPaste')}
      </p>
      <Textarea
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label={t('hiringReplied')}
      />
      <span className="flex justify-end">
        <button
          type="button"
          className="rr-btn rr-btn--secondary rr-btn--sm"
          disabled={!text.trim()}
          onClick={() =>
            actions.reply.mutate(
              { roleId: role.id, personId: person.id, text },
              {
                onSuccess: ({ optedOut }) => {
                  toast(optedOut ? t('hiringReplyOptOut') : t('hiringReplyOk'))
                  setText('')
                  setOpen(false)
                },
              },
            )
          }
        >
          {t('hiringReplySave')}
        </button>
      </span>
    </div>
  )
}

const MODES = [
  { id: 'review', label: 'hiringModeReview', hint: 'hiringModeReviewHint' },
  { id: 'batch', label: 'hiringModeBatch', hint: 'hiringModeBatchHint' },
  {
    id: 'automatic',
    label: 'hiringModeAutomatic',
    hint: 'hiringModeAutomaticHint',
  },
] as const

/** How much Redrob does on this role. Automatic is not offered where a law needs more first. */
export const RoleMode: FC<{ role: Role }> = ({ role }) => {
  const actions = useOutreachActions()
  const { data: policy } = useHiringPolicy()
  const teamOff = policy?.automatic === false
  const automaticOk = automaticAllowed(role.location) && !teamOff
  const current = MODES.find((m) => m.id === role.mode) ?? MODES[0]
  return (
    <div className="space-y-2">
      <div className="font-medium text-[13px]">{t('hiringModeLabel')}</div>
      <div
        className="rr-seg"
        role="radiogroup"
        aria-label={t('hiringModeLabel')}
      >
        {MODES.map((mode) => (
          // biome-ignore lint/a11y/useSemanticElements: .rr-seg is the design system's segmented control, styled on button[aria-checked]
          <button
            key={mode.id}
            type="button"
            role="radio"
            aria-checked={role.mode === mode.id}
            disabled={mode.id === 'automatic' && !automaticOk}
            onClick={() =>
              actions.setMode.mutate({ roleId: role.id, mode: mode.id })
            }
          >
            {t(mode.label)}
          </button>
        ))}
      </div>
      <p className="text-[12px] text-[var(--text-secondary)]">
        {automaticOk
          ? t(current.hint)
          : `${t(current.hint)} ${teamOff ? t('hiringModeTeamOff') : t('hiringModeAutomaticBlocked')}`}
      </p>
    </div>
  )
}

type Calendar = 'Google Calendar' | 'Outlook Calendar'

/**
 * "Offer interview times": the side panel reads the chosen calendar (read only) and finds free slots;
 * the times then wait on Interviews for the recruiter to add to Messages.
 */
export const OfferTimes: FC<{ role: Role; person: PersonOnRole }> = ({
  role,
  person,
}) => {
  const { data: integrations } = useGetUserMCPIntegrations()
  const { data: interviews = [] } = useInterviews(role.id)
  const calendars = (['Google Calendar', 'Outlook Calendar'] as const).filter(
    (name) =>
      integrations?.integrations.some(
        (i) => i.name === name && i.is_authenticated,
      ),
  )
  const [picked, setPicked] = useState<Calendar | undefined>()
  const calendar = picked && calendars.includes(picked) ? picked : calendars[0]
  const open = interviews.some(
    (i) =>
      i.personId === person.id &&
      !['booked', 'cancelled', 'needs-you'].includes(i.status),
  )
  if (open) return null
  if (!calendar) {
    return (
      <span className="text-[12px] text-[var(--text-tertiary)]">
        {t('hiringConnectCalendar')}
      </span>
    )
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      {calendars.length > 1 ? (
        <select
          className="rr-select rr-select--sm"
          aria-label={t('hiringOfferFrom', calendar)}
          value={calendar}
          onChange={(e) => setPicked(e.target.value as Calendar)}
        >
          {calendars.map((c) => (
            <option key={c} value={c}>
              {t('hiringOfferFrom', c)}
            </option>
          ))}
        </select>
      ) : null}
      <button
        type="button"
        className="rr-btn rr-btn--secondary rr-btn--sm"
        onClick={() =>
          void timesRequestStorage
            .setValue({
              roleId: role.id,
              personId: person.id,
              name: person.record.name,
              connector: calendar,
            })
            .then(() => toast(t('hiringOfferQueued')))
        }
      >
        {t('hiringOfferTimes')}
      </button>
    </span>
  )
}
