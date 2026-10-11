/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { t } from '@browseros/i18n'
import type { ApplyMode } from '@browseros/jobs/profile'
import type { FC } from 'react'

const MODES: ApplyMode[] = ['review', 'batch', 'automatic']
const LABEL = {
  review: 'jobsModeReview',
  batch: 'jobsModeBatch',
  automatic: 'jobsModeAutomatic',
} as const

function modeHint(mode: ApplyMode, dailyCap: number): string {
  if (mode === 'review') return t('jobsModeReviewHint')
  if (mode === 'batch') return t('jobsModeBatchHint')
  return t('jobsModeAutomaticHint', dailyCap)
}

/**
 * How much Redrob does on its own, in increasing order. A `.rr-seg` radio group: one choice, always
 * visible, with a sentence under it that says exactly what the choice means for the submit button.
 */
export const ApplyModePicker: FC<{
  value: ApplyMode
  dailyCap: number
  onChange: (mode: ApplyMode) => void
}> = ({ value, dailyCap, onChange }) => (
  <div className="space-y-2">
    <div className="rr-seg" role="radiogroup" aria-label={t('jobsModeLabel')}>
      {MODES.map((mode) => (
        // biome-ignore lint/a11y/useSemanticElements: .rr-seg is the design system's segmented control, styled on button[aria-checked]
        <button
          key={mode}
          type="button"
          role="radio"
          aria-checked={value === mode}
          onClick={() => onChange(mode)}
        >
          {t(LABEL[mode])}
        </button>
      ))}
    </div>
    <p className="text-[12px] text-[var(--text-secondary)]">
      {modeHint(value, dailyCap)}
    </p>
  </div>
)
