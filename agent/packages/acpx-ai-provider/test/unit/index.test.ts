/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { describe, expect, test } from 'bun:test'
import { AcpxProvider, createAcpxProvider, VERSION } from '../../src/index'
import { MockAcpRuntime } from '../helpers/mock-acp-runtime'

describe('package surface', () => {
  test('exports VERSION sentinel', () => {
    expect(VERSION).toBe('0.0.0')
  })

  test('createAcpxProvider returns an AcpxProvider instance', () => {
    const runtime = new MockAcpRuntime()
    const provider = createAcpxProvider({ agent: 'claude', runtime })
    expect(provider).toBeInstanceOf(AcpxProvider)
  })
})
