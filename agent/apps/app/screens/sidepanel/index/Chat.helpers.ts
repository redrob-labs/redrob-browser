/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import type { Provider } from '@/components/chat/chatComponentTypes'
import type { ChatErrorProps } from './ChatError'

export type BuildChatErrorPropsInput = {
  chatError?: Error | null
  selectedProvider?: Pick<Provider, 'type'>
  retryLastTurn: () => void | Promise<void>
}

export function buildChatErrorProps({
  chatError,
  selectedProvider,
  retryLastTurn,
}: BuildChatErrorPropsInput): ChatErrorProps | null {
  if (!chatError) return null

  return {
    error: chatError,
    onRetry: () => {
      void retryLastTurn()
    },
    providerType: selectedProvider?.type,
  }
}
