/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

export function buildAgentApiUrl(baseUrl: string, path: string): string {
  const normalizedPath = path === '/' ? '' : path
  return `${baseUrl}/agents${normalizedPath}`
}
