/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

/**
 * @public
 */
export const getFavicons = (host: string) => {
  // return `https://icons.duckduckgo.com/ip3/${host}.ico`
  return `https://www.google.com/s2/favicons?domain=${host}&sz=28`
}
