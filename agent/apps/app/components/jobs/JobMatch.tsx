/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { t } from '@browseros/i18n'
import { Check, CircleDashed } from '@browseros/icons'
import type { JobMatch as Match } from '@browseros/jobs/match'
import type { FC } from 'react'

/**
 * How the posting measures against what the person is looking for, condition by condition, with the
 * posting's own words as evidence. The design system's MatchBreakdown anatomy (`.rr-match`) with our
 * strings: a condition the posting is silent on reads "No evidence either way" and is left out of the
 * count, never counted against the job.
 */
export const JobMatch: FC<{ match: Match; name: string; sub?: string }> = ({
  match,
  name,
  sub,
}) => (
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
      {match.items.length ? (
        <span className="rr-match__verdict">
          {match.judged
            ? t('jobsMatchVerdict', match.met, match.judged)
            : t('jobsMatchNoEvidence')}
        </span>
      ) : null}
    </div>
    {match.items.length ? (
      <ul className="rr-match__list">
        {match.items.map((item) => (
          <li
            key={item.criterion.id}
            className={`rr-match__row rr-match__row--${item.state}`}
          >
            <span
              className={`rr-match__icon rr-match__icon--${item.state}`}
              title={item.state === 'met' ? t('jobsMet') : t('jobsUnknown')}
            >
              {item.state === 'met' ? (
                <Check size={16} />
              ) : (
                <CircleDashed size={16} />
              )}
            </span>
            <span className="rr-match__cell">
              <span className="rr-match__label">
                {item.criterion.text}
                {item.criterion.kind === 'must' ? (
                  <span className="rr-badge rr-badge--sm rr-badge--subtle rr-badge--neutral ml-2">
                    {t('jobsMust')}
                  </span>
                ) : null}
              </span>
              {item.evidence ? (
                <span className="rr-match__evidence" translate="no">
                  “{item.evidence}”
                </span>
              ) : (
                <span className="rr-match__evidence rr-match__evidence--none">
                  {t('jobsNoEvidence')}
                </span>
              )}
              <span className="rr-match__sr">
                {item.state === 'met' ? t('jobsMet') : t('jobsUnknown')}
              </span>
            </span>
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-[13px] text-[var(--text-secondary)]">
        {t('jobsMatchNoCriteria')}
      </p>
    )}
  </div>
)
