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
import { VisualRail } from './VisualRail'

describe('VisualRail', () => {
  it('renders the dog logo from the chromium-allowlisted icon path', () => {
    const html = renderToStaticMarkup(<VisualRail />)

    // A literal /icon/128.png keeps the chromium build allowlist happy; an
    // import would emit a new hashed asset and fail verify-chromium-build.ts.
    expect(html).toContain('src="/icon/128.png"')
    expect(html).toContain('Redrob')
  })
})
