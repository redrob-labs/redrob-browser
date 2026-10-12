/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The recruiter's answer when a candidate asks what was held about them and how it was used (Recruit
 * plan §3.4, §4b): the design system's DecisionNotice, built from the record. What was used, what is
 * never used, that a person decided, and what they can ask for. Copied as plain text to send in a
 * reply; Talent Scout has no candidate-facing page.
 */

import { activeCriteria } from '@browseros/hiring/criteria'
import { t } from '@browseros/i18n'
import { DecisionNotice } from '@redrob-labs/ui'
import type { FC } from 'react'
import { toast } from 'sonner'
import type { PersonOnRole, Role } from '@/modules/hiring/hiring.hooks'

const STATE = {
  met: 'hiringMet',
  partly: 'hiringPartly',
  missing: 'hiringMissing',
  unknown: 'hiringUnknown',
} as const

export function noticeParts(role: Role, person: PersonOnRole) {
  const results = new Map(
    person.evaluation?.results.map((r) => [r.criterionId, r.state]) ?? [],
  )
  const used = activeCriteria(role.criteria).map((c) =>
    t(
      'hiringNoticeCriterion',
      c.text,
      t(STATE[results.get(c.id) ?? 'unknown']),
    ),
  )
  const rights = [
    t('hiringNoticeRightSee'),
    t('hiringNoticeRightCorrect'),
    t('hiringNoticeRightDelete'),
    t('hiringNoticeRightStop'),
    t('hiringNoticeRightHuman'),
  ]
  return {
    title: t('hiringNoticeTitle'),
    decision: t('hiringNoticeDecision', role.title, t('hiringNoticeReviewer')),
    used,
    notUsed: t('hiringNoticeNotUsedList').split(' · '),
    humanReview: t('hiringNoticeHuman'),
    rights,
  }
}

export function noticeText(parts: ReturnType<typeof noticeParts>): string {
  return [
    parts.title,
    '',
    parts.decision,
    '',
    `${t('hiringNoticeUsed')}:`,
    ...parts.used.map((u) => `- ${u}`),
    '',
    `${t('hiringNoticeNotUsed')}:`,
    ...parts.notUsed.map((u) => `- ${u}`),
    '',
    parts.humanReview,
    '',
    `${t('hiringNoticeRights')}:`,
    ...parts.rights.map((r) => `- ${r}`),
  ].join('\n')
}

export const CandidateNotice: FC<{
  role: Role
  person: PersonOnRole
  /** The company's independent audit, from its team policy. */
  auditHref?: string
}> = ({ role, person, auditHref }) => {
  const parts = noticeParts(role, person)
  return (
    <div className="space-y-2">
      <DecisionNotice
        title={parts.title}
        decision={parts.decision}
        usedLabel={t('hiringNoticeUsed')}
        used={parts.used}
        notUsedLabel={t('hiringNoticeNotUsed')}
        notUsed={parts.notUsed}
        humanReview={parts.humanReview}
        rightsLabel={t('hiringNoticeRights')}
        rights={parts.rights}
        auditHref={auditHref}
        auditLabel={t('hiringNoticeAudit')}
      />
      <span className="flex justify-end">
        <button
          type="button"
          className="rr-btn rr-btn--secondary rr-btn--sm"
          onClick={() =>
            void navigator.clipboard
              .writeText(noticeText(parts))
              .then(() => toast.success(t('hiringNoticeCopied')))
          }
        >
          {t('hiringNoticeCopy')}
        </button>
      </span>
    </div>
  )
}
