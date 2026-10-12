/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { activeCriteria } from '@browseros/hiring/criteria'
import { t } from '@browseros/i18n'
import type { FC } from 'react'
import type { HiringPanel } from '@/modules/hiring/panel.hooks'
import { PersonCard } from './PersonCard'
import { PersonMatch } from './PersonMatch'

/** The person card, once the recruiter has checked the open profile against a role. */
export const HiringPanels: FC<{ panel: HiringPanel }> = ({ panel }) =>
  panel.reviewedList ? (
    <ReviewedList panel={panel} />
  ) : panel.card ? (
    <PersonCard
      role={panel.card.role}
      person={panel.card.person}
      onShortlist={panel.shortlist}
      onSetAside={panel.setAside}
      onClose={panel.close}
    />
  ) : null

/** "Check against <role>" on a profile; with no role yet, the way to set one up. */
export const HiringChips: FC<{ panel: HiringPanel }> = ({ panel }) => (
  <>
    {panel.sendNext ? (
      <button type="button" className="rr-prompt" onClick={panel.sendNext.run}>
        {t(
          'hiringPanelSendNext',
          panel.sendNext.position,
          panel.sendNext.total,
        )}
      </button>
    ) : null}
    {panel.findTimes ? (
      <button type="button" className="rr-prompt" onClick={panel.findTimes.run}>
        {t('hiringPanelFindTimes', panel.findTimes.name)}
      </button>
    ) : null}
    {panel.saveToAts ? (
      <button type="button" className="rr-prompt" onClick={panel.saveToAts.run}>
        {t('hiringPanelSaveTo', panel.saveToAts.name, panel.saveToAts.ats)}
      </button>
    ) : null}
    {panel.book ? (
      <button type="button" className="rr-prompt" onClick={panel.book.run}>
        {t('hiringPanelBook', panel.book.name)}
      </button>
    ) : null}
    {panel.listChips.map((role) => (
      <button
        key={role.id}
        type="button"
        className="rr-prompt"
        disabled={panel.busy}
        aria-busy={panel.busy}
        onClick={() => void panel.review(role)}
      >
        {panel.busy
          ? t('hiringChecking')
          : t('hiringReviewList', panel.listCount, role.title)}
      </button>
    ))}
    {panel.chips.map((role) => (
      <button
        key={role.id}
        type="button"
        className="rr-prompt"
        disabled={panel.busy}
        aria-busy={panel.busy}
        onClick={() => void panel.check(role)}
      >
        {panel.busy ? t('hiringChecking') : t('hiringChip', role.title)}
      </button>
    ))}
    {panel.noRole ? (
      <button
        type="button"
        className="rr-prompt"
        onClick={() => window.open('/app.html#/hiring', '_blank')}
      >
        {t('hiringChipNoRole')}
      </button>
    ) : null}
  </>
)

/**
 * A list, reviewed: one compact match per person, and one action that is the recruiter's own click.
 * Nobody is set aside here; people who do not meet every must have stay found, for the recruiter.
 */
const ReviewedList: FC<{ panel: HiringPanel }> = ({ panel }) => {
  const list = panel.reviewedList
  if (!list) return null
  const criteria = activeCriteria(list.role.criteria)
  const meeting = list.people.filter(
    (p) => p.evaluation?.meetsEveryMust && p.stage === 'found',
  )
  return (
    <section className="rr-card space-y-3 p-4" aria-label={t('hiringTitle')}>
      <h2 className="font-semibold text-[14px]">
        {t('hiringReviewTitle', list.people.length)}
      </h2>
      <p className="text-[13px] text-[var(--text-secondary)]">
        {t('hiringReviewDone', list.people.length, meeting.length)}
        {list.notChecked
          ? ` ${t('hiringReviewNotChecked', list.notChecked, list.problem ?? '')}`
          : ''}
      </p>
      <ul className="space-y-3">
        {list.people.map((p) => (
          <li key={p.id}>
            <PersonMatch
              name={p.record.name}
              sub={p.record.headline}
              criteria={criteria}
              evaluation={p.evaluation}
            />
          </li>
        ))}
      </ul>
      <footer className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          className="rr-btn rr-btn--ghost rr-btn--sm"
          onClick={panel.closeList}
        >
          {t('hiringNotNow')}
        </button>
        {meeting.length ? (
          <button
            type="button"
            className="rr-btn rr-btn--primary rr-btn--sm"
            onClick={() => void panel.saveAllMeeting()}
          >
            {t('hiringSaveAllMust', meeting.length)}
          </button>
        ) : null}
      </footer>
      <p className="text-[11px] text-[var(--text-tertiary)]">
        {t('hiringYouDecide')}
      </p>
    </section>
  )
}
