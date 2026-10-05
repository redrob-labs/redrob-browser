/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { describe, expect, it } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { StatusBadge } from './StatusBadge'

describe('StatusBadge', () => {
  it('renders cancelled sessions as stopped', () => {
    expect(renderToStaticMarkup(<StatusBadge status="cancelled" />)).toContain(
      'Stopped',
    )
  })

  it('renders a static live badge with no animation', () => {
    const html = renderToStaticMarkup(<StatusBadge status="live" />)
    expect(html).toContain('Live')
    expect(html).not.toContain('animate-pulse')
  })
})
