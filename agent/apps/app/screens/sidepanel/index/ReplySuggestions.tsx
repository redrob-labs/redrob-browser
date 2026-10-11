/**
 * @license
 * Copyright 2026 Redrob
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { t } from '@browseros/i18n'
import type { FC } from 'react'
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion'

export interface ReplySuggestionsProps {
  replies: string[]
  /** Chips are only live under the last assistant message; older ones are history. */
  isLastMessage: boolean
  disabled?: boolean
  onSelect: (reply: string) => void
}

/**
 * Up to three follow-up replies in the user's voice, rendered as chips under the assistant's
 * last message. Clicking one sends it as the user's next message, exactly as typed.
 */
export const ReplySuggestions: FC<ReplySuggestionsProps> = ({
  replies,
  isLastMessage,
  disabled = false,
  onSelect,
}) => {
  if (!isLastMessage || replies.length === 0) return null
  return (
    <Suggestions
      className="pt-1"
      aria-label={t('spSuggestedReplies')}
      data-testid="reply-suggestions"
    >
      {replies.map((reply) => (
        <Suggestion
          key={reply}
          suggestion={reply}
          onClick={onSelect}
          disabled={disabled}
        />
      ))}
    </Suggestions>
  )
}
