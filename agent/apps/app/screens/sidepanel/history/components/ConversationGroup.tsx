/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import type { FC } from 'react'
import { ConversationItem } from './ConversationItem'
import type { HistoryConversation } from './types'

export interface ConversationGroupProps {
  label: string
  conversations: HistoryConversation[]
  onDelete?: (id: string) => void
  activeConversationId: string
}

export const ConversationGroup: FC<ConversationGroupProps> = ({
  label,
  conversations,
  onDelete,
  activeConversationId,
}) => {
  if (conversations.length === 0) return null

  return (
    <div className="mb-4">
      <h3 className="ui-shell-label mb-1 px-3">{label}</h3>
      <div className="space-y-1">
        {conversations.map((conversation) => (
          <ConversationItem
            key={conversation.id}
            conversation={conversation}
            onDelete={onDelete}
            isActive={conversation.id === activeConversationId}
          />
        ))}
      </div>
    </div>
  )
}
