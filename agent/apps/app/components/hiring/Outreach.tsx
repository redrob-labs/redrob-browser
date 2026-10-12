/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The outreach controls on a person and on a role: write a message (Redrob drafts it, or the recruiter
 * writes it when no AI can), record a reply, and choose how much Redrob does on the role.
 */

import { automaticAllowed } from '@browseros/hiring/outreach'
import { type SiteId, siteById } from '@browseros/hiring/sites'
import { getLocale, t } from '@browseros/i18n'
import { type FC, useState } from 'react'
import { toast } from 'sonner'
import { Textarea } from '@/components/ui/textarea'
import {
  type PersonOnRole,
  type Role,
  useHiringPolicy,
  useOutreachActions,
} from '@/modules/hiring/hiring.hooks'
import { screenProblem } from '@/modules/hiring/labels'

export const WriteMessage: FC<{
  role: Role
  person: PersonOnRole
  sequence?: number
}> = ({ role, person, sequence = 0 }) => {
  const actions = useOutreachActions()
  const [own, setOwn] = useState<{ reason: string; text: string } | null>(null)
  let site: string = person.record.site
  try {
    site = siteById(person.record.site as SiteId).name
  } catch {}
  const notice = t('hiringNotice', site)
  const base = {
    roleId: role.id,
    personId: person.id,
    notice,
    language: getLocale(),
    sequence,
  }
  if (own) {
    return (
      <div className="space-y-2">
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
