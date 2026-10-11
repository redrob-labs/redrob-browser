/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { t } from '@browseros/i18n'
import type { FC } from 'react'
import type { JobPanel } from '@/modules/jobs/panel.hooks'
import { JobPostingCard } from './JobPostingCard'

/** The posting card, while the person is deciding how to apply. */
export const JobPanels: FC<{ panel: JobPanel }> = ({ panel }) =>
  panel.open && panel.posting && panel.profile && panel.match ? (
    <JobPostingCard
      posting={panel.posting}
      profile={panel.profile}
      match={panel.match}
      mode={panel.mode}
      unanswered={panel.unanswered}
      busy={panel.busy}
      onModeChange={panel.setMode}
      onApply={panel.apply}
      onShortlist={panel.shortlist}
      onClose={() => panel.setOpen(false)}
      onOpenProfile={() => window.open('/app.html#/jobs', '_blank')}
    />
  ) : null

/**
 * The chips above the composer: "Apply with Redrob" on a job posting, and the next application of a
 * batch the person approved. `.rr-prompt` pills, like the other moments: things to ask, not settings.
 */
export const JobChips: FC<{ panel: JobPanel }> = ({ panel }) => (
  <>
    {panel.batch ? (
      <button type="button" className="rr-prompt" onClick={panel.batch.next}>
        {t('jobsBatchNext', panel.batch.position, panel.batch.total)}
      </button>
    ) : null}
    {panel.chip ? (
      <button
        type="button"
        className="rr-prompt"
        title={t('jobsChipHint')}
        onClick={() => panel.setOpen(true)}
      >
        {t('jobsChip')}
      </button>
    ) : null}
  </>
)
