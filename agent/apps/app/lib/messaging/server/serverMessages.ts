/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { defineExtensionMessaging } from '@webext-core/messaging'
import type { McpTool } from '@/lib/mcp/client'

type ServerMessagesProtocol = {
  checkHealth(): { healthy: boolean }
  fetchMcpTools(): { tools: McpTool[]; error?: string }
}

/**
 * @public
 */
const { sendMessage, onMessage } =
  defineExtensionMessaging<ServerMessagesProtocol>()

export { onMessage as onServerMessage, sendMessage as sendServerMessage }
