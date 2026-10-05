/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { storage } from '@wxt-dev/storage'

export interface SelectedTextData {
  text: string
  pageUrl: string
  pageTitle: string
  tabId: number
  timestamp: number
}

/** Map of tabId → selected text. Each tab's selection is independent. */
export const selectedTextStorage = storage.defineItem<
  Record<string, SelectedTextData>
>('local:selectedTextMap', { defaultValue: {} })
