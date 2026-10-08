/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { describe, expect, it } from 'bun:test'
import { mapTopSitesToRecentSites } from './recent-sites.helpers'

describe('mapTopSitesToRecentSites', () => {
  it('maps a top site to name, url, and the parsed host', () => {
    const [site] = mapTopSitesToRecentSites(
      [{ url: 'https://example.com/path', title: 'Example' }],
      5,
    )
    expect(site).toEqual({
      name: 'Example',
      url: 'https://example.com/path',
      host: 'example.com',
    })
  })

  it('leaves host undefined when the url cannot be parsed', () => {
    const [site] = mapTopSitesToRecentSites(
      [{ url: 'not-a-valid-url', title: 'Bad' }],
      5,
    )
    expect(site.host).toBeUndefined()
    expect(site.name).toBe('Bad')
  })

  it('returns at most max entries', () => {
    const sites = Array.from({ length: 8 }, (_, i) => ({
      url: `https://site${i}.com`,
      title: `Site ${i}`,
    }))
    expect(mapTopSitesToRecentSites(sites, 5)).toHaveLength(5)
  })
})
