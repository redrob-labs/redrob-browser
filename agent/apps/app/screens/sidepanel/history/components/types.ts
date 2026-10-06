/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

export interface HistoryConversation {
  id: string
  lastMessagedAt: number
  lastUserMessage: string
}

export type TimeGroup = 'today' | 'thisWeek' | 'thisMonth' | 'older'

export interface GroupedConversations {
  today: HistoryConversation[]
  thisWeek: HistoryConversation[]
  thisMonth: HistoryConversation[]
  older: HistoryConversation[]
}
