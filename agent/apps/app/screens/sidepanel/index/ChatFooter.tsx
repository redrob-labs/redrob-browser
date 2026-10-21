/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { t } from '@browseros/i18n'
import { ChevronDown, Folder, Layers } from '@browseros/icons'
import type { FC, FormEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { AppSelector } from '@/components/elements/AppSelector'
import { WorkspaceSelector } from '@/components/elements/workspace-selector'
import { McpServerIcon } from '@/components/mcp/McpServerIcon'
import { GOOGLE_APPS } from '@/lib/google-apps'
import {
  type SelectedTextData,
  selectedTextStorage,
} from '@/lib/selected-text/selectedTextStorage'
import type { ChatMode } from '@/modules/chat/chat-types'
import { useWorkspace } from '@/modules/workspace/workspace.hooks'
import { ChatAttachedTabs } from './ChatAttachedTabs'
import { ChatInput, type ChatInputHandle } from './ChatInput'
import { ChatModeToggle } from './ChatModeToggle'
import { ChatSelectedText } from './ChatSelectedText'

export interface ChatFooterProps {
  mode: ChatMode
  onModeChange: (mode: ChatMode) => void
  input: string
  onInputChange: (value: string) => void
  onSubmit: (e: FormEvent) => void
  status: 'streaming' | 'submitted' | 'ready' | 'error'
  onStop: () => void
  sendDisabled?: boolean
  attachedTabs: chrome.tabs.Tab[]
  onToggleTab: (tab: chrome.tabs.Tab) => void
  onRemoveTab: (tabId?: number) => void
}

export const ChatFooter: FC<ChatFooterProps> = ({
  mode,
  onModeChange,
  input,
  onInputChange,
  onSubmit,
  status,
  onStop,
  sendDisabled,
  attachedTabs,
  onToggleTab,
  onRemoveTab,
}) => {
  const { selectedFolder } = useWorkspace()
  const chatInputRef = useRef<ChatInputHandle>(null)
  const [selectionMap, setSelectionMap] = useState<
    Record<string, SelectedTextData>
  >({})
  const [activeTabId, setActiveTabId] = useState<number | undefined>()

  // Track active tab for tab-scoped selection display
  useEffect(() => {
    chrome.tabs
      .query({ active: true, currentWindow: true })
      .then((tabs) => setActiveTabId(tabs[0]?.id))
    const listener = (activeInfo: { tabId: number }) => {
      setActiveTabId(activeInfo.tabId)
    }
    chrome.tabs.onActivated.addListener(listener)
    return () => chrome.tabs.onActivated.removeListener(listener)
  }, [])

  // Watch selected text storage (per-tab map)
  useEffect(() => {
    selectedTextStorage.getValue().then(setSelectionMap)
    const unwatch = selectedTextStorage.watch(setSelectionMap)
    return () => unwatch()
  }, [])

  const visibleSelectedText = activeTabId
    ? (selectionMap[String(activeTabId)] ?? null)
    : null
  const [isTabMentionOpen, setIsTabMentionOpen] = useState(false)

  useEffect(() => {
    const focusInput = () => {
      const active = document.activeElement
      const isInteractiveElementFocused =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement ||
        active instanceof HTMLButtonElement
      if (!isInteractiveElementFocused) {
        chatInputRef.current?.focus()
      }
    }

    if (document.hasFocus()) {
      focusInput()
    }

    window.addEventListener('focus', focusInput)
    return () => window.removeEventListener('focus', focusInput)
  }, [])

  return (
    <footer className="ui-panel-foot">
      <ChatAttachedTabs tabs={attachedTabs} onRemoveTab={onRemoveTab} />
      {visibleSelectedText && (
        <ChatSelectedText
          selectedText={visibleSelectedText}
          onDismiss={() => {
            if (!activeTabId) return
            const key = String(activeTabId)
            selectedTextStorage.getValue().then((map) => {
              const { [key]: _, ...rest } = map
              selectedTextStorage.setValue(rest)
            })
          }}
        />
      )}

      <div className="p-3">
        <div className="flex items-center gap-2">
          <ChatModeToggle mode={mode} onModeChange={onModeChange} />

          <div aria-hidden="true" className="ui-panel-divider" />

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => chatInputRef.current?.toggleTabMention()}
              data-tab-mention-trigger
              data-state={isTabMentionOpen ? 'open' : 'closed'}
              aria-expanded={isTabMentionOpen}
              aria-haspopup="dialog"
              className="ui-panel-tool"
              title={t('spAttachTabs')}
              aria-label={t('spAttachTabs')}
            >
              <Layers className="h-4 w-4" />
              {attachedTabs.length > 0 && (
                <span className="ui-panel-tool__count">
                  {attachedTabs.length}
                </span>
              )}
              <ChevronDown className="h-3 w-3" />
            </button>

            <WorkspaceSelector side="top">
              <button
                type="button"
                className="ui-panel-tool"
                data-selected={selectedFolder ? '' : undefined}
                aria-label={
                  selectedFolder ? selectedFolder.name : t('spSelectFolder')
                }
                title={
                  selectedFolder ? selectedFolder.name : t('spSelectFolder')
                }
              >
                <div className="relative">
                  <Folder className="h-4 w-4" />
                  {selectedFolder && (
                    <div className="ui-panel-tool__dot absolute -top-0.5 -right-0.5" />
                  )}
                </div>
                <ChevronDown className="h-3 w-3" />
              </button>
            </WorkspaceSelector>

            <AppSelector
              side="top"
              onPickPrompt={(prompt) => {
                onInputChange(prompt)
                chatInputRef.current?.focus()
              }}
            >
              <button
                type="button"
                className="ui-panel-tool"
                title={t('gaMenuTitle')}
                aria-label={t('gaMenuTitle')}
              >
                <div className="flex items-center -space-x-1">
                  {GOOGLE_APPS.slice(0, 3).map((app) => (
                    <div
                      key={app.id}
                      className="rounded-full ring-2 ring-[var(--surface-base)]"
                    >
                      <McpServerIcon serverName={app.name} size={14} />
                    </div>
                  ))}
                </div>
                <ChevronDown className="h-3 w-3" />
              </button>
            </AppSelector>
          </div>
        </div>

        <ChatInput
          input={input}
          status={status}
          mode={mode}
          sendDisabled={sendDisabled}
          onInputChange={onInputChange}
          onSubmit={onSubmit}
          onStop={onStop}
          selectedTabs={attachedTabs}
          onToggleTab={onToggleTab}
          onTabMentionOpenChange={setIsTabMentionOpen}
          ref={chatInputRef}
        />
      </div>
    </footer>
  )
}
