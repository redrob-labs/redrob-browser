/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { t } from '@browseros/i18n'
import { Bot, ChevronDown, History, Plus, SettingsIcon } from '@browseros/icons'
import type { FC } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { BRAND_MARKS } from '@/components/agents/agent-brand-marks'
import { ChatProviderSelector } from '@/components/chat/ChatProviderSelector'
import type { Provider } from '@/components/chat/chatComponentTypes'
import { ThemeToggle } from '@/components/elements/theme-toggle'
import { ProviderIcon } from '@/lib/llm-providers/providerIcons'
import type { ProviderType } from '@/lib/llm-providers/types'
import { cn } from '@/lib/utils'

export interface ChatHeaderProps {
  /** Null while nothing is connected. The header still renders, saying so. */
  selectedProvider: Provider | null
  providers: Provider[]
  onSelectProvider: (provider: Provider) => void
  onNewConversation: () => void
  hasMessages: boolean
  hideHistory?: boolean
  /** Lets the full-page chat opt into spacing without changing the sidepanel. */
  className?: string
}

export const ChatHeader: FC<ChatHeaderProps> = ({
  selectedProvider,
  providers,
  onSelectProvider,
  onNewConversation,
  hasMessages,
  hideHistory,
  className,
}) => {
  const location = useLocation()
  const navigate = useNavigate()
  const isHistoryPage = location.pathname === '/history'

  const handleNewConversationFromHistory = () => {
    onNewConversation()
    navigate('/')
  }

  return (
    <header
      className={cn(
        'ui-panel-head flex items-center justify-between px-3 py-2.5',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {/* Provider Selector */}
        <ChatProviderSelector
          providers={providers}
          selectedProvider={selectedProvider}
          onSelectProvider={onSelectProvider}
        >
          <button
            type="button"
            className="group rr-btn rr-btn--sm rr-btn--secondary gap-1.5 px-2"
            title={t('spChangeProvider')}
          >
            <HeaderProviderIcon provider={selectedProvider} />
            <span
              className={cn(
                'font-semibold text-[15px]',
                !selectedProvider && 'text-muted-foreground',
              )}
            >
              {selectedProvider?.name ?? t('spNoProvider')}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-[var(--ink-muted)] transition-transform group-data-[state=open]:rotate-180" />
          </button>
        </ChatProviderSelector>
      </div>

      <div className="flex items-center gap-1">
        {!isHistoryPage && hasMessages && (
          <button
            type="button"
            onClick={onNewConversation}
            className="rr-iconbtn rr-iconbtn--sm"
            title={t('spNewConversation')}
            aria-label={t('spNewConversation')}
          >
            <Plus className="h-4 w-4" />
          </button>
        )}

        {!hideHistory &&
          (isHistoryPage ? (
            <button
              type="button"
              onClick={handleNewConversationFromHistory}
              className="rr-iconbtn rr-iconbtn--sm"
              title={t('spNewConversation')}
              aria-label={t('spNewConversation')}
            >
              <Plus className="h-4 w-4" />
            </button>
          ) : (
            <Link
              to="/history"
              className="rr-iconbtn rr-iconbtn--sm"
              title={t('spChatHistory')}
              aria-label={t('spChatHistory')}
            >
              <History className="h-4 w-4" />
            </Link>
          ))}

        <a
          href="/app.html#/settings"
          target="_blank"
          rel="noopener noreferrer"
          className="rr-iconbtn rr-iconbtn--sm"
          title={t('spSettings')}
          aria-label={t('spSettings')}
        >
          <SettingsIcon className="h-4 w-4" />
        </a>

        <ThemeToggle className="size-8" iconClassName="h-4 w-4" />
      </div>
    </header>
  )
}

function HeaderProviderIcon({ provider }: { provider: Provider | null }) {
  if (!provider) return <Bot className="h-[18px] w-[18px]" />
  if (provider.kind === 'acp') {
    const Mark = BRAND_MARKS[provider.brandKey ?? '']
    return Mark ? (
      <Mark className="h-[18px] w-[18px]" />
    ) : (
      <Bot className="h-[18px] w-[18px]" />
    )
  }
  return <ProviderIcon type={provider.type as ProviderType} size={18} />
}
