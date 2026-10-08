/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import {
  CONVERSATION_ID_PLACEHOLDER,
  LLMHeadersSchema,
} from '@browseros/shared/schemas/llm'

export function resolveProviderHeaders(
  headers: Record<string, string> | undefined,
  conversationId: string = crypto.randomUUID(),
): Record<string, string> | undefined {
  if (!headers) return undefined
  return Object.fromEntries(
    Object.entries(LLMHeadersSchema.parse(headers)).map(([name, value]) => [
      name,
      value.replaceAll(CONVERSATION_ID_PLACEHOLDER, conversationId),
    ]),
  )
}
