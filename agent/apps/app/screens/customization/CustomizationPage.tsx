/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { t } from '@browseros/i18n'
import type { FC } from 'react'
import { SettingsHeader } from '@/components/settings/SettingsLayout'
import { AppearanceSettings } from './AppearanceSettings'
import { ToolbarSettingsCard } from './ToolbarSettingsCard'

export const CustomizationPage: FC = () => {
  return (
    <div className="fade-in slide-in-from-bottom-5 animate-in space-y-8 duration-500">
      <SettingsHeader title={t('customizeTitle')} lede={t('customizeLede')} />
      <AppearanceSettings />
      <ToolbarSettingsCard />
    </div>
  )
}
