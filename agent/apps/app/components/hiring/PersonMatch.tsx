/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { Criterion } from '@browseros/hiring/criteria'
import type { Evaluation, MatchState } from '@browseros/hiring/evaluate'
import { t } from '@browseros/i18n'
import { Check, CircleDashed, Minus, X } from '@browseros/icons'
import type { FC } from 'react'

const STATE_LABEL = {
  met: 'hiringMet',
  partly: 'hiringPartly',
  missing: 'hiringMissing',
  unknown: 'hiringUnknown',
} as const

/** The design system's icon modifiers are met / partly / missing; unknown has its own row style. */
const ICON_MODIFIER: Record<MatchState, string> = {
  met: 'met',
  partly: 'partly',
  missing: 'missing',
  unknown: 'unknown',
}

const StateIcon: FC<{ state: MatchState }> = ({ state }) =>
  state === 'met' ? (
    <Check size={16} />
  ) : state === 'partly' ? (
    <Minus size={16} />
  ) : state === 'missing' ? (
    <X size={16} />
  ) : (
    <CircleDashed size={16} />
  )

/**
 * How one person measures against a role, the design system's MatchBreakdown anatomy (`.rr-match`)
 * with our strings. Every row shows what it rests on, "No evidence either way" is left out of the
 * count, and what was never used is listed beside what was. There is no score.
 */
export const PersonMatch: FC<{
  name: string
  sub?: string
  criteria: readonly Criterion[]
  evaluation?: Evaluation | null
}> = ({ name, sub, criteria, evaluation }) => {
  const byId = new Map(evaluation?.results.map((r) => [r.criterionId, r]) ?? [])
  return (
    <div className="rr-match">
      <div className="rr-match__head">
        <span className="rr-match__body">
          <span className="rr-match__name" translate="no">
            {name}
          </span>
          {sub ? (
            <span className="rr-match__sub" translate="no">
              {sub}
            </span>
          ) : null}
        </span>
        <span className="rr-match__verdict">
          {evaluation?.judged
            ? t('hiringMeets', evaluation.met, evaluation.judged)
            : t('hiringNotChecked')}
        </span>
      </div>
      <ul className="rr-match__list">
        {criteria.map((criterion) => {
          const result = byId.get(criterion.id)
          const state: MatchState = result?.state ?? 'unknown'
          return (
            <li
              key={criterion.id}
              className={`rr-match__row rr-match__row--${state}`}
            >
              <span
                className={`rr-match__icon rr-match__icon--${ICON_MODIFIER[state]}`}
                title={t(STATE_LABEL[state])}
              >
                <StateIcon state={state} />
              </span>
              <span className="rr-match__cell">
                <span className="rr-match__label">
                  {criterion.text}
                  {criterion.kind === 'must' ? (
                    <span className="rr-badge rr-badge--sm rr-badge--subtle rr-badge--neutral ml-2">
                      {t('hiringMust')}
                    </span>
                  ) : null}
                </span>
                {result?.evidence ? (
                  <span className="rr-match__evidence" translate="no">
                    “{result.evidence}”
                  </span>
                ) : (
                  <span className="rr-match__evidence rr-match__evidence--none">
                    {state === 'unknown'
                      ? t('hiringNoEvidence')
                      : t(STATE_LABEL[state])}
                  </span>
                )}
                <span className="rr-match__sr">{t(STATE_LABEL[state])}</span>
              </span>
            </li>
          )
        })}
      </ul>
      <p className="mt-2 text-[12px] text-[var(--text-tertiary)]">
        {t('hiringNotUsed')}
      </p>
    </div>
  )
}
