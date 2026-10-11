/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { t, tCount } from '@browseros/i18n'
import type { JobMatch as Match } from '@browseros/jobs/match'
import type { JobPosting } from '@browseros/jobs/posting'
import type { ApplyMode, JobProfile } from '@browseros/jobs/profile'
import type { FC } from 'react'
import { ApplyModePicker } from './ApplyModePicker'
import { JobMatch } from './JobMatch'

/**
 * The posting the tab is showing, before anything is filled: how it measures up, how Redrob will
 * apply, and what is missing from the profile. One primary action, worded for what it will do: in
 * review mode it fills; otherwise it applies.
 */
export const JobPostingCard: FC<{
  posting: JobPosting
  profile: JobProfile
  match: Match
  mode: ApplyMode
  unanswered: number
  busy?: boolean
  onModeChange: (mode: ApplyMode) => void
  onApply: () => void
  onShortlist: () => void
  onClose: () => void
  onOpenProfile: () => void
}> = ({
  posting,
  profile,
  match,
  mode,
  unanswered,
  busy,
  onModeChange,
  onApply,
  onShortlist,
  onClose,
  onOpenProfile,
}) => {
  const sub = [posting.company, posting.location].filter(Boolean).join(' · ')
  const needsSetup = !profile.resume || unanswered > 0
  return (
    <section className="rr-card space-y-4 p-4" aria-label={t('jobsTitle')}>
      <JobMatch match={match} name={posting.title} sub={sub} />

      <ApplyModePicker
        value={mode}
        dailyCap={profile.dailyCap}
        onChange={onModeChange}
      />

      {mode === 'automatic' && !match.qualifies ? (
        <p className="text-[12px] text-[var(--text-secondary)]">
          {t('jobsAutomaticSkips')}
        </p>
      ) : null}

      {needsSetup ? (
        <div className="space-y-1 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] p-3 text-[12px] text-[var(--text-secondary)]">
          {!profile.resume ? <p>{t('jobsNoResume')}</p> : null}
          {unanswered > 0 ? (
            <p>{tCount('jobsUnanswered', unanswered)}</p>
          ) : null}
          <button
            type="button"
            className="rr-btn rr-btn--ghost rr-btn--sm -ml-2"
            onClick={onOpenProfile}
          >
            {t('jobsOpenProfile')}
          </button>
        </div>
      ) : null}

      <footer className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          className="rr-btn rr-btn--ghost rr-btn--sm"
          onClick={onClose}
        >
          {t('jobsNotNow')}
        </button>
        <button
          type="button"
          className="rr-btn rr-btn--secondary rr-btn--sm"
          disabled={busy}
          onClick={onShortlist}
        >
          {t('jobsShortlist')}
        </button>
        <button
          type="button"
          className="rr-btn rr-btn--primary rr-btn--sm"
          disabled={busy}
          aria-busy={busy}
          onClick={onApply}
        >
          {mode === 'review' ? t('jobsApplyReview') : t('jobsApplySend')}
        </button>
      </footer>
      {/* Sites' terms are about unattended applying; in review mode the person sends it. */}
      {mode !== 'review' ? (
        <p className="text-[11px] text-[var(--text-tertiary)]">
          {t('jobsSiteTerms')}
        </p>
      ) : null}
    </section>
  )
}
