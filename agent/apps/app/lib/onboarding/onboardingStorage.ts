/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { storage } from '@wxt-dev/storage'

export const importHintDismissedAtStorage = storage.defineItem<number | null>(
  'local:importHintDismissedAt',
  { fallback: null },
)

export const firstRunConfettiShownStorage = storage.defineItem<boolean>(
  'local:firstRunConfettiShown',
  { fallback: false },
)
