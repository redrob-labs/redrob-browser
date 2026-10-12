/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { t } from '@browseros/i18n'
import type { FC } from 'react'
import type { HiringPanel } from '@/modules/hiring/panel.hooks'
import { PersonCard } from './PersonCard'

/** The person card, once the recruiter has checked the open profile against a role. */
export const HiringPanels: FC<{ panel: HiringPanel }> = ({ panel }) =>
  panel.card ? (
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
