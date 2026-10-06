/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { errorResult } from '@browseros/browser-mcp/tools/framework'
import type { BrowserToolGuard } from '../browser-tool-dispatch'

/** Internal leases authorize calls only while their conversation is running. */
export const guardConversationRunning: BrowserToolGuard = (call) => {
  if (!call.lease || call.run) return null
  return errorResult('MCP tools require an active conversation run.')
}
