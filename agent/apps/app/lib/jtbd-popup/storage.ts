/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { storage } from '@wxt-dev/storage'

export interface JtbdPopupState {
  messageCount: number
  surveyTaken: boolean
  samplingId: number
  dontShowAgain: boolean
  shownCount: number
}

export const jtbdPopupStorage = storage.defineItem<JtbdPopupState>(
  'local:jtbdPopupState',
  {
    fallback: {
      messageCount: 0,
      surveyTaken: false,
      samplingId: -1,
      dontShowAgain: false,
      shownCount: 0,
    },
  },
)
