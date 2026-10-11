/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { t } from '@browseros/i18n'
import { ShieldCheck, ShieldX } from '@browseros/icons'
import {
  ComposerStatus,
  type ComposerStatusItem,
  PrivacyProtection,
} from '@redrob-labs/ui'
import type { FC } from 'react'
import { usePrivacyStatus } from '@/modules/privacy/privacy.hooks'
import { levelBars, type PrivacyStatus } from '@/modules/privacy/privacy.types'
import { LEVEL_NAME, modelNote } from '@/modules/privacy/privacy-copy'

export interface PrivacyStatusLineProps {
  /** The chosen agent's name when it is an external agent the gate does not cover. */
  externalAgentName?: string
  /** Opens Settings, Privacy. */
  onOpenSettings: () => void
}

/**
 * What will happen to this message, above the composer, before Send: the design system's
 * ComposerStatus with one item, Privacy, whose panel is PrivacyProtection.
 *
 * Three honest states. On: the level and "Running on this computer". Off: says so, in the warn
 * tone. An external agent: "Not checked", because that agent sends with its own AI and a shield
 * that looked on would be the one claim here that is false.
 */
export const PrivacyStatusLine: FC<PrivacyStatusLineProps> = ({
  externalAgentName,
  onOpenSettings,
}) => {
  const { data: status } = usePrivacyStatus()
  if (!status) return null
  const item = privacyItem(status, externalAgentName, onOpenSettings)
  return <ComposerStatus label={t('privacyStatusGroup')} items={[item]} />
}

export function privacyItem(
  status: PrivacyStatus,
  externalAgentName: string | undefined,
  onOpenSettings: () => void,
): ComposerStatusItem {
  const foot = (
    <button
      type="button"
      className="rr-btn rr-btn--ghost rr-btn--sm"
      onClick={onOpenSettings}
    >
      {t('privacyOpenSettings')}
    </button>
  )
  if (externalAgentName) {
    return {
      id: 'privacy',
      name: t('privacyStatusName'),
      value: t('privacyStatusNotProtected'),
      tone: 'warn',
      icon: <ShieldX className="size-[14px]" />,
      panelLabel: t('privacyName'),
      panel: (
        <PrivacyProtection
          state="off"
          offTitle={t('privacyExternalTitle')}
          offText={t('privacyExternalText', externalAgentName)}
          foot={foot}
        />
      ),
    }
  }
  if (status.level === 'off') {
    return {
      id: 'privacy',
      name: t('privacyStatusName'),
      value: t('privacyLevelOff'),
      tone: 'plain',
      icon: <ShieldX className="size-[14px]" />,
      panelLabel: t('privacyName'),
      panel: (
        <PrivacyProtection
          state="off"
          offTitle={t('privacyOffTitle')}
          offText={t('privacyLevelOffDetail')}
          foot={foot}
        />
      ),
    }
  }
  const note = modelNote(status.level, status.detector)
  return {
    id: 'privacy',
    name: t('privacyStatusName'),
    value: t(LEVEL_NAME[status.level]),
    tone: 'safe',
    icon: <ShieldCheck className="size-[14px]" />,
    level: { n: levelBars(status.level), of: 3 },
    panelLabel: t('privacyName'),
    panel: (
      <PrivacyProtection
        state="on"
        level={status.level}
        levels={[
          {
            id: status.level,
            label: t(LEVEL_NAME[status.level]),
            n: levelBars(status.level),
          },
        ]}
        onLabel={t('privacyOnTitle')}
        running={t('privacyRunning')}
        summary={t('privacyKeptWeek', status.keptThisWeek)}
        lede={t('privacyLede')}
        showLevels={false}
        last={note ?? undefined}
        foot={foot}
      />
    ),
  }
}
