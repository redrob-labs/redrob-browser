/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

const HIDE_FOCUS_GRID_PATHS = new Set(['/home', '/home/chat'])

export function isAgentCommandPath(pathname: string): boolean {
  return pathname === '/home'
}

export function shouldHideFocusGrid(pathname: string): boolean {
  return HIDE_FOCUS_GRID_PATHS.has(pathname)
}

export function shouldUseChatSession(pathname: string): boolean {
  return pathname === '/home/chat'
}
