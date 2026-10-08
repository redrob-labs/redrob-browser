/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { expect, test } from 'bun:test'
import { sanitizeEvent } from './sanitize'

test('redacts all custom header values from captured configuration', () => {
  const event: { extra: Record<string, unknown> } = {
    extra: {
      provider: 'openai-compatible',
      headers: { 'x-private-key': 'secret' },
    },
  }
  expect(sanitizeEvent(event).extra).toEqual({
    provider: 'openai-compatible',
    headers: '[REDACTED]',
  })
})
