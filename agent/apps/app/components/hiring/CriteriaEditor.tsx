/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { deviceCheckFor, refuseCriterion } from '@browseros/hiring/criteria'
import { t } from '@browseros/i18n'
import { Plus, Trash2 } from '@browseros/icons'
import type { FC } from 'react'
import { Input } from '@/components/ui/input'
import type { CriterionDraft } from '@/modules/hiring/hiring.hooks'
import { refusalText } from '@/modules/hiring/labels'

/**
 * A role's criteria, the design system's Criteria anatomy in our strings. Each row is a must have or
 * a nice to have; one Redrob proposed is "My assumption" and counts only once confirmed. Wording that
 * names a protected trait or a proxy says why it can't be used, as it is typed. "Never use" is shown
 * and cannot be edited.
 */
export const CriteriaEditor: FC<{
  items: CriterionDraft[]
  onChange: (items: CriterionDraft[]) => void
}> = ({ items, onChange }) => {
  const set = (index: number, patch: Partial<CriterionDraft>) =>
    onChange(items.map((c, i) => (i === index ? { ...c, ...patch } : c)))
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {items.map((criterion, index) => {
          const refused = criterion.text.trim()
            ? refuseCriterion(criterion.text)
            : null
          const onDevice = Boolean(
            criterion.text.trim() && deviceCheckFor(criterion.text),
          )
          return (
            <li key={criterion.id ?? index} className="space-y-1">
              <span className="flex items-center gap-2">
                <div
                  className="rr-seg shrink-0"
                  role="radiogroup"
                  aria-label={t('hiringCriteria')}
                >
                  {(['must', 'nice'] as const).map((kind) => (
                    // biome-ignore lint/a11y/useSemanticElements: .rr-seg is the design system's segmented control, styled on button[aria-checked]
                    <button
                      key={kind}
                      type="button"
                      role="radio"
                      aria-checked={criterion.kind === kind}
                      onClick={() => set(index, { kind })}
                    >
                      {kind === 'must' ? t('hiringMust') : t('hiringNice')}
                    </button>
                  ))}
                </div>
                <Input
                  aria-label={t('hiringCriteria')}
                  placeholder={t('hiringCriterionPlaceholder')}
                  value={criterion.text}
                  aria-invalid={refused ? true : undefined}
                  onChange={(e) => set(index, { text: e.target.value })}
                />
                <button
                  type="button"
                  className="rr-iconbtn rr-iconbtn--sm shrink-0"
                  aria-label={t('jobsRemove')}
                  title={t('jobsRemove')}
                  onClick={() => onChange(items.filter((_, i) => i !== index))}
                >
                  <Trash2 className="size-[14px]" />
                </button>
              </span>
              <span className="flex flex-wrap items-center gap-2 pl-1 text-[12px]">
                {criterion.inferred && !criterion.confirmed ? (
                  <>
                    <span className="rr-badge rr-badge--sm rr-badge--subtle rr-badge--warning">
                      {t('hiringAssumption')}
                    </span>
                    <button
                      type="button"
                      className="rr-btn rr-btn--ghost rr-btn--sm"
                      onClick={() => set(index, { confirmed: true })}
                    >
                      {t('hiringConfirm')}
                    </button>
                  </>
                ) : null}
                {onDevice && !refused ? (
                  <span className="text-[var(--text-tertiary)]">
                    {t('hiringCheckedHere')}
                  </span>
                ) : null}
                {refused ? (
                  <span role="alert" className="text-[var(--text-secondary)]">
                    {refusalText(criterion.text, refused)}
                  </span>
                ) : null}
              </span>
            </li>
          )
        })}
      </ul>
      <button
        type="button"
        className="rr-btn rr-btn--ghost rr-btn--sm"
        onClick={() => onChange([...items, { text: '', kind: 'must' }])}
      >
        <Plus className="size-[14px]" />
        {t('hiringCriterionAdd')}
      </button>
      <div className="rounded-[var(--radius-md)] bg-[var(--surface-sunken)] p-3 text-[12px]">
        <div className="font-medium">{t('hiringNeverUse')}</div>
        <div className="text-[var(--text-secondary)]">
          {t('hiringNeverUseList')}
        </div>
      </div>
    </div>
  )
}
