/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { MessageSquare, MousePointer2 } from 'lucide-react'
import type { FC } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { ChatMode } from '@/modules/chat/chat-types'

export interface ChatModeToggleProps {
  mode: ChatMode
  onModeChange: (mode: ChatMode) => void
}

export const ChatModeToggle: FC<ChatModeToggleProps> = ({
  mode,
  onModeChange,
}) => {
  const isAgentMode = mode === 'agent'

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onModeChange(isAgentMode ? 'chat' : 'agent')}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 font-medium text-xs transition-all',
              isAgentMode
                ? 'border-border/50 bg-muted text-muted-foreground hover:text-foreground'
                : 'border-[var(--accent-brand)]/30 bg-[var(--accent-brand)]/10 text-[var(--accent-brand-ink)]',
            )}
          >
            {isAgentMode ? (
              <>
                <MousePointer2 className="h-3 w-3" />
                <span>Agent Mode ON</span>
              </>
            ) : (
              <>
                <MessageSquare className="h-3 w-3" />
                <span>Chat Mode ON</span>
              </>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px]">
          {isAgentMode
            ? 'AI can browse, click, and navigate'
            : 'AI can only read, cannot click or navigate'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
