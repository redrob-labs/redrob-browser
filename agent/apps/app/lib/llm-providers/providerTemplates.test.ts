/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { describe, expect, it } from 'bun:test'
import { providerTemplates } from './providerTemplates'

describe('providerTemplates', () => {
  it('uses ChatGPT as the display name for new ChatGPT providers', () => {
    const template = providerTemplates.find(
      (provider) => provider.id === 'chatgpt-pro',
    )

    expect(template).toMatchObject({
      name: 'ChatGPT',
      defaultModelId: 'gpt-5.5',
      contextWindow: 1050000,
    })
  })
})
