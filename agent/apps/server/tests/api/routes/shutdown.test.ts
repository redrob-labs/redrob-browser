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

import { describe, expect, it, mock } from 'bun:test'
import { createShutdownRoute } from '../../../src/api/routes/shutdown'

describe('createShutdownRoute', () => {
  it('returns ok and invokes shutdown asynchronously', async () => {
    const onShutdown = mock(() => {})
    const route = createShutdownRoute({ onShutdown })

    const response = await route.request('/', { method: 'POST' })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ status: 'ok' })
    expect(onShutdown).not.toHaveBeenCalled()

    await new Promise<void>((resolve) => setImmediate(resolve))

    expect(onShutdown).toHaveBeenCalledTimes(1)
  })
})
