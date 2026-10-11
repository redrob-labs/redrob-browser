/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * A playbook, step by step, with every stop marked: the design system's Playbook anatomy
 * (`.rr-playbook`), written here because the component's counts ("Stops for you twice") are fixed
 * English. The stop count is derived from the steps, so the footer cannot disagree with them.
 */

import { getLocale, t, tCount } from '@browseros/i18n'
import { ShieldCheck } from '@browseros/icons'
import type { Playbook } from '@browseros/playbooks/playbook'
import type { FC, ReactNode } from 'react'

export function listOf(items: readonly string[]): string {
  try {
    return new Intl.ListFormat(getLocale(), { type: 'conjunction' }).format(
      items,
    )
  } catch {
    return items.join(', ')
  }
}

/** A step's intent with `{input}` shown as the input's label. */
export function stepText(playbook: Playbook, intent: string): string {
  return intent.replace(/\{([a-z][a-z0-9_]*)\}/g, (whole, id: string) => {
    const input = playbook.inputs.find((i) => i.id === id)
    return input ? `‹${input.label}›` : whole
  })
}

export const PlaybookView: FC<{
  playbook: Playbook
  badge?: ReactNode
  actions?: ReactNode
  head?: ReactNode
}> = ({ playbook, badge, actions, head }) => {
  const stops = playbook.steps.filter((s) => s.stop).length
  return (
    <div className="rr-playbook">
      <div className="rr-playbook__head">
        <span className="rr-playbook__body">
          {head ?? (
            <>
              <span className="rr-playbook__name">
                {playbook.name} {badge}
              </span>
              <span className="rr-playbook__purpose">{playbook.purpose}</span>
            </>
          )}
        </span>
      </div>
      <div className="space-y-0.5 px-4 pb-2 text-[12px] text-[var(--text-secondary)]">
        {playbook.inputs.length ? (
          <div>
            {t('playbookAsksFor', listOf(playbook.inputs.map((i) => i.label)))}
          </div>
        ) : null}
        <div translate="no">{t('playbookUses', listOf(playbook.sites))}</div>
      </div>
      <ol className="rr-playbook__steps">
        {playbook.steps.map((step, index) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: steps are an ordered list with no ids.
            key={index}
            className={`rr-playbook__step${step.stop ? 'rr-playbook__step--gate' : ''}`}
          >
            <span className="rr-playbook__n">{index + 1}</span>
            <span className="rr-playbook__cell">
              <span className="rr-playbook__label">
                {stepText(playbook, step.intent)}
              </span>
              {step.reason ? (
                <span className="rr-playbook__detail">{step.reason}</span>
              ) : null}
            </span>
            {step.stop ? (
              <span className="rr-playbook__gate">
                <span className="rr-playbook__gateIcon">
                  <ShieldCheck className="size-[13px]" />
                </span>
                <span>{t('playbookAsksFirst')}</span>
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      <div className="rr-playbook__foot">
        <span className="rr-playbook__foothalf">
          {stops === 0
            ? t('playbookStraight')
            : stops === 1
              ? t('playbookStopsOne')
              : t('playbookStopsOther', stops)}
        </span>
        <span className="rr-playbook__meta">
          {tCount('playbookSteps', playbook.steps.length)}
        </span>
      </div>
      {actions ? (
        <div className="flex justify-end gap-2 px-4 pb-4">{actions}</div>
      ) : null}
    </div>
  )
}
