/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { ArrowRight, Pencil, Sparkles } from '@browseros/icons'
import { type FC, useEffect, useRef, useState } from 'react'
import { sentry } from '@/lib/sentry/sentry'
import { cn } from '@/lib/utils'
import type { ChatMode } from '@/modules/chat/chat-types'
import {
  STARTER_PROMPT_SLOTS,
  type StarterPrompt,
} from '@/modules/chat/starter-prompts'
import { useStarterPrompts } from '@/modules/chat/starter-prompts.hooks'
import { saveStarterPrompts } from '@/modules/chat/starter-prompts-storage'
import { StarterPromptEditor } from './StarterPromptEditor'

export interface ChatEmptyStateProps {
  mode: ChatMode
  mounted: boolean
  onSuggestionClick: (suggestion: string) => void
}

/** Shared by side-panel and new-tab chat; mode changes discard unsaved drafts. */
export const ChatEmptyState: FC<ChatEmptyStateProps> = (props) => (
  <ModeEmptyState key={props.mode} {...props} />
)

const ModeEmptyState: FC<ChatEmptyStateProps> = ({
  mode,
  mounted,
  onSuggestionClick,
}) => {
  const { prompts, isLoading, loadError, retry } = useStarterPrompts(mode)
  const [editing, setEditing] = useState(false)
  const customizeRef = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)

  useEffect(() => {
    if (!editing && restoreFocus.current) {
      customizeRef.current?.focus()
      restoreFocus.current = false
    }
  }, [editing])

  const finishEditing = () => {
    restoreFocus.current = true
    setEditing(false)
  }

  const save = async (draft: StarterPrompt[]) => {
    try {
      await saveStarterPrompts(mode, draft)
      finishEditing()
    } catch (error) {
      sentry.captureException(error, {
        extra: { message: 'Failed to save starter prompts', mode },
      })
      throw error
    }
  }

  // Grow with the editor in short panels; shrinking this centered flex child
  // would place the form's top above the parent's reachable scroll area.
  return (
    <div
      className={cn(
        'm-0! flex min-h-full w-full shrink-0 flex-col justify-center py-4 opacity-0 transition-all duration-700',
        mounted ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
      )}
    >
      {editing ? (
        <StarterPromptEditor
          prompts={prompts}
          onSave={save}
          onCancel={finishEditing}
        />
      ) : (
        <>
          {/* .rr-empty--compact: left-aligned, a brand-subtle disc, then the prompts as its actions. */}
          <div className="rr-empty rr-empty--compact w-full">
            <span className="rr-empty__icon" aria-hidden="true">
              <Sparkles />
            </span>
            <div className="flex flex-col gap-1">
              <h2 className="rr-empty__title">
                {mode === 'chat'
                  ? 'Chat with this page'
                  : 'Agent at your service'}
              </h2>
              <p className="rr-empty__desc">
                {mode === 'chat'
                  ? 'Ask questions about the current page or any topic'
                  : 'Let AI automate tasks and browse for you'}
              </p>
            </div>
            <div className="group/prompts rr-prompts ui-panel-prompts mt-3 w-full">
              {STARTER_PROMPT_SLOTS.map((slot) => (
                <button
                  type="button"
                  key={slot}
                  onClick={() => onSuggestionClick(prompts[slot].prompt)}
                  className="rr-prompt"
                >
                  <span className="rr-prompt__icon" aria-hidden="true">
                    <ArrowRight className="size-3.5" />
                  </span>
                  <span className="min-w-0 break-words">
                    {prompts[slot].display}
                  </span>
                </button>
              ))}
              {/* Opacity reserves the hover target's space and keeps it keyboard
                reachable. Touch users get the same action without needing hover. */}
              <button
                ref={customizeRef}
                type="button"
                disabled={isLoading || loadError}
                onClick={() => setEditing(true)}
                className="rr-btn rr-btn--sm rr-btn--ghost gap-1.5 opacity-0 transition-opacity disabled:cursor-wait group-focus-within/prompts:opacity-100 group-hover/prompts:opacity-100 [@media(hover:none)]:opacity-100"
              >
                <Pencil aria-hidden="true" className="size-3" />
                Customize prompts
              </button>
              {loadError && (
                <p role="alert" className="text-[var(--status-danger)] text-xs">
                  Could not load saved prompts.{' '}
                  <button type="button" onClick={retry} className="underline">
                    Retry
                  </button>
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
