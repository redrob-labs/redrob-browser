/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

export interface RecentSite {
  name: string
  url: string
  host?: string
}

/** Trim raw `chrome.topSites` entries into the shape the row renders: keep the
 * title and url, extract the host for favicon lookup (left undefined when the
 * url can't be parsed), and cap the list at `max`. */
export function mapTopSitesToRecentSites(
  sites: readonly { url: string; title: string }[],
  max: number,
): RecentSite[] {
  return sites.slice(0, max).map((site) => {
    let host: string | undefined
    try {
      host = new URL(site.url).host
    } catch {
      // Unparseable url — the row falls back to a generic glyph.
    }
    return { name: site.title, url: site.url, host }
  })
}
