/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { type MessageKey, t } from '@browseros/i18n'
import type { UIMessage } from 'ai'
import dayjs from 'dayjs'
import type {
  GroupedConversations,
  HistoryConversation,
  TimeGroup,
} from './types'

/** Message keys; read through t() where shown, so the label follows the page's language. */
export const TIME_GROUP_LABELS: Record<TimeGroup, MessageKey> = {
  today: 'spGroupToday',
  thisWeek: 'spGroupThisWeek',
  thisMonth: 'spGroupThisMonth',
  older: 'spGroupOlder',
}

const getTimeGroup = (timestamp: number): TimeGroup => {
  const date = dayjs(timestamp)
  const now = dayjs()

  if (date.isSame(now, 'day')) return 'today'
  if (date.isSame(now, 'week')) return 'thisWeek'
  if (date.isSame(now, 'month')) return 'thisMonth'
  return 'older'
}

export const extractLastUserMessage = (messages: UIMessage[]): string => {
  const userMessages = messages.filter((m) => m.role === 'user')
  const lastUserMessage = userMessages[userMessages.length - 1]

  if (!lastUserMessage) return t('spNewConversation')

  const textParts = lastUserMessage.parts.filter((p) => p.type === 'text')
  const text = textParts.map((p) => (p as { text: string }).text).join(' ')

  return text || t('spNewConversation')
}

export const groupConversations = (
  conversations: HistoryConversation[],
): GroupedConversations => {
  const groups: GroupedConversations = {
    today: [],
    thisWeek: [],
    thisMonth: [],
    older: [],
  }

  for (const conversation of conversations) {
    const group = getTimeGroup(conversation.lastMessagedAt)
    groups[group].push(conversation)
  }

  return groups
}
