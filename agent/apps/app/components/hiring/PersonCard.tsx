/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { activeCriteria } from '@browseros/hiring/criteria'
import { t } from '@browseros/i18n'
import { Lock } from '@browseros/icons'
import { type FC, useState } from 'react'
import type {
  PersonOnRole,
  Role,
  SetAsideReason,
} from '@/modules/hiring/hiring.hooks'
import { SET_ASIDE_REASONS } from '@/modules/hiring/labels'
import { PersonMatch } from './PersonMatch'

/**
 * One person against one role: the match with its evidence, and the recruiter's two choices. "Not
 * now" asks for a reason from a short neutral list, because that reason is what the record keeps;
 * Redrob only suggests, the recruiter decides (plan §3.1, §4b).
 */
export const PersonCard: FC<{
  role: Role
  person: PersonOnRole
  busy?: boolean
  onShortlist: () => void
  onSetAside: (reason: SetAsideReason) => void
  onClose?: () => void
}> = ({ role, person, busy, onShortlist, onSetAside, onClose }) => {
  const [asking, setAsking] = useState(false)
  const current =
    person.record.positions.find((p) => p.current) ?? person.record.positions[0]
  const sub = [
    person.record.headline ??
      (current
        ? [current.title, current.organisation].filter(Boolean).join(', ')
        : ''),
    person.record.location,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <section className="rr-card space-y-3 p-4" aria-label={t('hiringTitle')}>
      <PersonMatch
        name={person.record.name}
        sub={sub}
        criteria={activeCriteria(role.criteria)}
        evaluation={person.evaluation}
      />
      {person.evaluation?.suggestsSetAside ? (
        <p className="text-[12px] text-[var(--text-secondary)]">
          {t('hiringSuggestSetAside')}
        </p>
      ) : null}
      {person.record.addressesAi ? (
        <p className="text-[12px] text-[var(--text-secondary)]">
          {t('hiringAiNote')}
        </p>
      ) : null}
      {person.readByModel ? (
        <p className="text-[12px] text-[var(--text-tertiary)]">
          {t('hiringReadByModel')}
        </p>
      ) : null}
      <p className="flex items-center gap-1.5 text-[12px] text-[var(--text-tertiary)]">
        <Lock className="size-[12px]" aria-hidden />
        {t('hiringPrivacyLine')}
      </p>
      {asking ? (
        <fieldset className="space-y-2">
          <legend className="font-medium text-[13px]">
            {t('hiringNotNowWhy')}
          </legend>
          <div className="flex flex-wrap gap-2">
            {SET_ASIDE_REASONS.map((reason) => (
              <button
                key={reason.id}
                type="button"
                className="rr-btn rr-btn--secondary rr-btn--sm"
                disabled={busy}
                onClick={() => {
                  setAsking(false)
                  onSetAside(reason.id)
                }}
              >
                {t(reason.label)}
              </button>
            ))}
          </div>
        </fieldset>
      ) : (
        <footer className="flex flex-wrap items-center justify-end gap-2">
          {onClose ? (
            <button
              type="button"
              className="rr-btn rr-btn--ghost rr-btn--sm"
              onClick={onClose}
            >
              {t('hiringNotNow')}
            </button>
          ) : null}
          {person.stage !== 'set-aside' ? (
            <button
              type="button"
              className="rr-btn rr-btn--secondary rr-btn--sm"
              disabled={busy}
              onClick={() => setAsking(true)}
            >
              {t('hiringStageSetAside')}
            </button>
          ) : null}
          {person.stage === 'found' || person.stage === 'set-aside' ? (
            <button
              type="button"
              className="rr-btn rr-btn--primary rr-btn--sm"
              disabled={busy}
              onClick={onShortlist}
            >
              {t('hiringShortlist')}
            </button>
          ) : null}
        </footer>
      )}
      <p className="text-[11px] text-[var(--text-tertiary)]">
        {t('hiringYouDecide')}
      </p>
    </section>
  )
}
