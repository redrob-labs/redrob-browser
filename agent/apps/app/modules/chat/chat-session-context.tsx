/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { createContext, type FC, type ReactNode, useContext } from 'react'
import { useSyncRemoteIntegrations } from '@/modules/mcp/sync-remote-integrations.hooks'
import { type ChatSessionOptions, useChatSession } from './chat-session.hooks'

type ChatSessionContextValue = ReturnType<typeof useChatSession>

const ChatSessionContext = createContext<ChatSessionContextValue | null>(null)

export const ChatSessionProvider: FC<
  { children: ReactNode } & ChatSessionOptions
> = ({ children, ...options }) => {
  const { hasSynced } = useSyncRemoteIntegrations()
  const session = useChatSession({
    ...options,
    isIntegrationsSynced: hasSynced,
  })
  return (
    <ChatSessionContext.Provider value={session}>
      {children}
    </ChatSessionContext.Provider>
  )
}

export const useChatSessionContext = () => {
  const context = useContext(ChatSessionContext)
  if (!context) {
    throw new Error(
      'useChatSessionContext must be used within a ChatSessionProvider',
    )
  }
  return context
}
