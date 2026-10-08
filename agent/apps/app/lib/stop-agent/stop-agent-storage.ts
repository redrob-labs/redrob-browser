/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { storage } from '@wxt-dev/storage'

/**
 * @public
 */
export interface StopAgentStorage {
  conversationId: string
  timestamp: number
}

/**
 * @public
 */
export const stopAgentStorage = storage.defineItem<StopAgentStorage | null>(
  'local:stop-agent',
  {
    fallback: null,
  },
)
