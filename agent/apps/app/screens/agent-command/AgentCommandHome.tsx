/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { Search, Sparkles } from 'lucide-react'
import { type FC, useState } from 'react'
import { useNavigate } from 'react-router'
import { NoProviderNotice } from '@/components/chat/NoProviderNotice'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Feature } from '@/lib/browseros/capabilities'
import { createBrowserOSAction } from '@/lib/chat-actions/types'
import { openSidePanelWithSearch } from '@/lib/messaging/sidepanel/openSidepanelWithSearch'
import { useCapabilities } from '@/modules/browseros/capabilities.hooks'
import { stagePendingHomeMessage } from '@/modules/chat/pending-home-message'
import { useChatTargetSelection } from '@/modules/chat/use-chat-target-selection'
import { ImportDataHint } from '@/screens/newtab/index/ImportDataHint'
import { useShowImportHint } from '@/screens/newtab/index/import-hint.hooks'
import { RecentSites } from '@/screens/newtab/index/RecentSites'
import { ScheduleResults } from '@/screens/newtab/index/ScheduleResults'
import {
  ConversationInput,
  type ConversationInputSendInput,
} from './ConversationInput'
import { HomeSearchInput } from './HomeSearchInput'
import { resolveHomeLlmRoutingMode } from './home-compose.helpers'

/** Search is the default: a new tab is opened to go somewhere far more often than to start a task. */
type HomeMode = 'search' | 'ask'
const DEFAULT_HOME_MODE: HomeMode = 'search'

export const AgentCommandHome: FC = () => {
  const navigate = useNavigate()
  const [homeMode, setHomeMode] = useState<HomeMode>(DEFAULT_HOME_MODE)
  const showImportHint = useShowImportHint()
  const { supports, isLoading: capabilitiesLoading } = useCapabilities()
  const supportsInlineChat = supports(Feature.NEWTAB_CHAT_SUPPORT)
  const llmRoutingMode = resolveHomeLlmRoutingMode({
    capabilitiesLoading,
    supportsInlineChat,
  })
  // Shared selection: the picker is derived from the persisted selection (kept in
  // sync with the sidebar and settings), so a third-party agent chosen here is
  // restored on load and falls back to the default LLM provider while agents load.
  const {
    chatTargets,
    providerOptions,
    selectedProvider,
    selectProvider,
    selectChatTarget,
    hasAnyTarget,
    isSettled,
  } = useChatTargetSelection()
  const waitingForLlmCapabilities =
    selectedProvider?.kind === 'llm' && llmRoutingMode === 'wait'
  const noTarget = isSettled && !hasAnyTarget
  // This composer does not run through the chat session hook, so it carries its
  // own copy of the refused-send state.
  const [sendAttemptBlocked, setSendAttemptBlocked] = useState(false)
  const sendBlocked = sendAttemptBlocked && noTarget

  const handleSend = async (input: ConversationInputSendInput) => {
    if (!selectedProvider) {
      // Answer the send rather than dropping it. This used to return silently,
      // which was invisible only because a provider was always present.
      setSendAttemptBlocked(true)
      return
    }
    if (selectedProvider.kind === 'llm' && llmRoutingMode === 'wait') return
    const target = chatTargets.find(
      (entry) =>
        entry.kind === selectedProvider.kind &&
        entry.id === selectedProvider.id,
    )
    if (!target) return
    await selectChatTarget(target)
    if (target.kind === 'llm' && llmRoutingMode === 'sidepanel') {
      const action = createBrowserOSAction({
        mode: 'chat',
        message: input.text,
        tabs: input.selectedTabs,
      })
      await openSidePanelWithSearch('open', {
        query: input.text,
        mode: 'chat',
        action,
      })
      return
    }
    const search = new URLSearchParams({ q: input.text, mode: 'agent' })
    if (input.attachments.length > 0) {
      search.set(
        'handoff',
        stagePendingHomeMessage({
          text: input.text,
          attachments: input.attachments,
        }),
      )
    }
    const tabIds = input.selectedTabs
      .map((tab) => tab.id)
      .filter((id): id is number => id !== undefined)
    if (tabIds.length > 0) search.set('tabs', tabIds.join(','))
    navigate(`/home/chat?${search.toString()}`)
  }

  return (
    <div className="min-h-full px-4 py-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <div className="flex flex-col items-center gap-5 pt-[max(18vh,24px)] text-center">
          <Tabs
            value={homeMode}
            onValueChange={(value) => setHomeMode(value as HomeMode)}
            className="w-full max-w-3xl items-center gap-4"
          >
            <TabsList aria-label="New tab mode">
              <TabsTrigger value="search" className="px-4">
                <Search aria-hidden />
                Search
              </TabsTrigger>
              <TabsTrigger value="ask" className="px-4">
                <Sparkles aria-hidden />
                Ask
              </TabsTrigger>
            </TabsList>

            <TabsContent value="search" className="w-full">
              <HomeSearchInput />
            </TabsContent>

            <TabsContent value="ask" className="w-full space-y-3">
              <ConversationInput
                variant="home"
                providers={providerOptions}
                selectedProvider={selectedProvider}
                onSelectProvider={selectProvider}
                onSend={handleSend}
                streaming={false}
                // Stays usable with nothing connected so the task someone came to
                // write survives the trip to provider setup. Only a genuinely
                // pending load disables it.
                disabled={
                  waitingForLlmCapabilities || (!selectedProvider && !noTarget)
                }
                attachmentsEnabled={selectedProvider?.kind === 'acp'}
                placeholder={
                  selectedProvider
                    ? `Ask ${selectedProvider.name} to handle a task...`
                    : noTarget
                      ? 'Describe a task...'
                      : 'Loading providers...'
                }
              />
              {noTarget && (
                <NoProviderNotice
                  blocked={sendBlocked}
                  variant="inline"
                  className="text-left"
                />
              )}
            </TabsContent>
          </Tabs>
        </div>

        <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 pb-12">
          <RecentSites />
          <ScheduleResults />
        </div>
      </div>

      {showImportHint ? <ImportDataHint /> : null}
    </div>
  )
}
