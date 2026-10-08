/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

/**
 * @public
 */
export const SHORTCUTS_LIST = [
  {
    key: 'A',
    description: 'Toggle Agent',
    modifier: {
      windows: 'Alt',
      mac: '⌥',
      linux: 'Alt',
    },
  },
  {
    key: 'K',
    description: 'Toggle LLM Chat',
    modifier: {
      windows: 'Ctrl+Shift',
      mac: '⌘+Shift',
      linux: 'Ctrl+Shift',
    },
  },
  {
    key: 'L',
    description: 'Switch providers in LLM Chat',
    modifier: {
      windows: 'Ctrl+Shift',
      mac: '⌘+Shift',
      linux: 'Ctrl+Shift',
    },
  },
]
