/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { t } from '@browseros/i18n'

/**
 * @public
 */
export const SHORTCUTS_LIST = [
  {
    key: 'A',
    description: t('shToggleAgent'),
    modifier: {
      windows: 'Alt',
      mac: '⌥',
      linux: 'Alt',
    },
  },
  {
    key: 'K',
    description: t('shToggleLlmChat'),
    modifier: {
      windows: 'Ctrl+Shift',
      mac: '⌘+Shift',
      linux: 'Ctrl+Shift',
    },
  },
  {
    key: 'L',
    description: t('shSwitchProvidersInLlmChat'),
    modifier: {
      windows: 'Ctrl+Shift',
      mac: '⌘+Shift',
      linux: 'Ctrl+Shift',
    },
  },
]
