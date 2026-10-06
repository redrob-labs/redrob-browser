/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

export type HomeLlmRoutingMode = 'wait' | 'inline-chat' | 'sidepanel'

export function resolveHomeLlmRoutingMode({
  capabilitiesLoading,
  supportsInlineChat,
}: {
  capabilitiesLoading: boolean
  supportsInlineChat: boolean
}): HomeLlmRoutingMode {
  if (capabilitiesLoading) return 'wait'
  return supportsInlineChat ? 'inline-chat' : 'sidepanel'
}
