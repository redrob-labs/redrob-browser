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

import { describe, expect, it } from 'bun:test'
import { IdentityService } from '../../src/lib/identity'

describe('IdentityService', () => {
  it('uses the install id when config provides one', () => {
    const service = new IdentityService()

    service.initialize({ installId: 'install-123' })

    expect(service.getBrowserOSId()).toBe('install-123')
  })

  it('uses an ephemeral UUID when durable installation state is unavailable', () => {
    const service = new IdentityService()

    service.initialize({ installId: '' })

    expect(service.getBrowserOSId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  })
})
