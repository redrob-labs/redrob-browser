/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

/**
 * @license
 * Copyright 2025 BrowserOS
 */

import { describe, it } from 'bun:test'
import assert from 'node:assert'

import { createHealthRoute } from '../../../src/api/routes/health'

describe('createHealthRoute', () => {
  it('returns status ok', async () => {
    const route = createHealthRoute()
    const response = await route.request('/')

    assert.strictEqual(response.status, 200)
    const body = await response.json()
    assert.deepStrictEqual(body, { status: 'ok' })
  })
})
