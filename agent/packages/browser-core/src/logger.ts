/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import type { LoggerInterface } from '@browseros/shared/types/logger'

export const logger: LoggerInterface = {
  debug(message, meta) {
    console.debug(message, meta ?? '')
  },
  info(message, meta) {
    console.info(message, meta ?? '')
  },
  warn(message, meta) {
    console.warn(message, meta ?? '')
  },
  error(message, meta) {
    console.error(message, meta ?? '')
  },
}
