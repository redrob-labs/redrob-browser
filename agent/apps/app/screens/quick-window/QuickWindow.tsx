/**
 * @license
 * Copyright 2026 Redrob and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { t } from '@browseros/i18n'
import { type FC, type KeyboardEvent, useEffect, useRef, useState } from 'react'
import {
  closeQuickWindow,
  openConversation,
  startQuickTask,
} from '@/lib/redrob/quick-window'
import { useServerConversations } from '@/modules/conversations/conversations.hooks'
import { conversationTitle } from '@/modules/conversations/history-list'

const RECENT_LIMIT = 5

/**
 * The page inside the quick window (CAP-5): one input and the most recent tasks.
 *
 * Enter hands the line to the agent through the same chat route the new tab uses; Esc closes. The
 * window itself is native (a frameless always-on-top widget opened by a global shortcut), so this page
 * has no chrome of its own to draw: no sidebar, no header, nothing a person would have to dismiss.
 */
export const QuickWindow: FC = () => {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { data } = useServerConversations(true)
  const recent = [...(data ?? [])]
    .sort((a, b) => b.lastMessagedAt - a.lastMessagedAt)
    .slice(0, RECENT_LIMIT)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submit = async () => {
    if (sending || !text.trim()) return
    setSending(true)
    try {
      await startQuickTask(text)
    } finally {
      setSending(false)
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void submit()
    }
  }

  return (
    <main
      className="flex h-screen flex-col gap-3 bg-background p-4 text-foreground"
      onKeyDown={(event) => {
        // Esc anywhere on the page, not only in the input: focus may be on a recent row.
        if (event.key === 'Escape') {
          event.preventDefault()
          closeQuickWindow()
        }
      }}
    >
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        disabled={sending}
        aria-label={t('qwInputLabel')}
        placeholder={t('qwPlaceholder')}
        className="h-12 w-full rounded-lg border border-border bg-card px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      <section aria-labelledby="qw-recent" className="min-h-0 flex-1 overflow-y-auto">
        <h2 id="qw-recent" className="ui-meta-label px-1 pb-1">
          {t('qwRecent')}
        </h2>
        {recent.length === 0 ? (
          <p className="px-1 py-2 text-muted-foreground text-sm">
            {t('qwNoRecent')}
          </p>
        ) : (
          <ul className="space-y-1">
            {recent.map((conversation) => {
              const title = conversationTitle(conversation.lastUserMessage)
              return (
                <li key={conversation.id}>
                  <button
                    type="button"
                    title={title}
                    onClick={() => void openConversation(conversation.id)}
                    className="ui-shell-link flex h-9 w-full min-w-0 items-center px-2 text-left text-sm"
                  >
                    <span className="truncate">{title}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <p className="text-muted-foreground text-xs">{t('qwHint')}</p>
    </main>
  )
}
