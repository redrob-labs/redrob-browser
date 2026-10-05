/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { describe, expect, it } from 'bun:test'
import { resolveHomeLlmRoutingMode } from './home-compose.helpers'

describe('resolveHomeLlmRoutingMode', () => {
  it('waits for capability initialization before falling back', () => {
    expect(
      resolveHomeLlmRoutingMode({
        capabilitiesLoading: true,
        supportsInlineChat: false,
      }),
    ).toBe('wait')
  })

  it('uses inline chat when capability checks pass', () => {
    expect(
      resolveHomeLlmRoutingMode({
        capabilitiesLoading: false,
        supportsInlineChat: true,
      }),
    ).toBe('inline-chat')
  })

  it('falls back after capability checks finish unsupported', () => {
    expect(
      resolveHomeLlmRoutingMode({
        capabilitiesLoading: false,
        supportsInlineChat: false,
      }),
    ).toBe('sidepanel')
  })
})
