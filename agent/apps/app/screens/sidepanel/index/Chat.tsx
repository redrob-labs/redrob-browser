/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { t } from '@browseros/i18n'
import { Loader2 } from '@browseros/icons'
import { useEffect, useRef, useState } from 'react'
import { NoProviderNotice } from '@/components/chat/NoProviderNotice'
import { HiringChips, HiringPanels } from '@/components/hiring/HiringPanels'
import { JobChips, JobPanels } from '@/components/jobs/JobPanels'
import { PlaybookPanels } from '@/components/playbooks/TeachPanel'
import {
  PrivacyConfirmDialog,
  type PrivacyConfirmRequest,
} from '@/components/privacy/PrivacyConfirmDialog'
import { SmartCompareCard } from '@/components/smart-compare/SmartCompareCard'
import { SmartCompareChip } from '@/components/smart-compare/SmartCompareChip'
import { createBrowserOSAction } from '@/lib/chat-actions/types'
import {
  SIDEPANEL_AI_TRIGGERED_EVENT,
  SIDEPANEL_MODE_CHANGED_EVENT,
  SIDEPANEL_STOP_CLICKED_EVENT,
  SIDEPANEL_SUGGESTION_CLICKED_EVENT,
  SIDEPANEL_TAB_REMOVED_EVENT,
  SIDEPANEL_TAB_TOGGLED_EVENT,
} from '@/lib/constants/analyticsEvents'
import { track } from '@/lib/metrics/track'
import { useChatSessionContext } from '@/modules/chat/chat-session-context'
import type { ChatMode } from '@/modules/chat/chat-types'
import { useHiringPanel } from '@/modules/hiring/panel.hooks'
import { useJobPanel } from '@/modules/jobs/panel.hooks'
import { useJtbdPopup } from '@/modules/jtbd-popup/jtbd-popup.hooks'
import { usePlaybookPanel } from '@/modules/playbooks/panel.hooks'
import { usePrivacyStatus } from '@/modules/privacy/privacy.hooks'
import {
  privateCount,
  privateKinds,
  splitPrivate,
} from '@/modules/privacy/private-spans'
import {
  useActiveProduct,
  useCompare,
  useCompareRegion,
} from '@/modules/smart-compare/smart-compare.hooks'
import { buildChatErrorProps } from './Chat.helpers'
import { ChatEmptyState } from './ChatEmptyState'
import { ChatError } from './ChatError'
import { ChatFooter } from './ChatFooter'
import { ChatMessages } from './ChatMessages'
import { IncognitoNotice } from './IncognitoNotice'

/**
 * @public
 */
export const Chat = () => {
  const {
    mode,
    setMode,
    messages,
    sendMessage,
    status,
    stop,
    agentUrlError,
    chatError,
    canSend,
    selectedProvider,
    getActionForMessage,
    liked,
    onClickLike,
    disliked,
    onClickDislike,
    isRestoringConversation,
    isIncognito,
    retryLastTurn,
    hasAnyTarget,
    isSettled,
    sendBlocked,
    conversationId,
  } = useChatSessionContext()

  const {
    popupVisible,
    showDontShowAgain,
    recordMessageSent,
    triggerIfEligible,
    onTakeSurvey,
    onDismiss: onDismissJtbdPopup,
  } = useJtbdPopup()

  const { data: privacy } = usePrivacyStatus()
  const playbookPanel = usePlaybookPanel({
    conversationId,
    send: (message: string) => sendNow(message),
  })
  const { runChips } = playbookPanel
  const hiring = useHiringPanel({
    conversationId,
    status,
    send: (message: string) => sendNow(message),
  })
  const jobs = useJobPanel({
    conversationId,
    status,
    send: (message: string) => sendNow(message),
  })
  const { product } = useActiveProduct()
  const [region, setRegion] = useCompareRegion()
  const compare = useCompare()
  // A result belongs to the product it was asked for; another tab's product hides it.
  const comparison =
    compare.data && product && compare.data.product.url === product.url
      ? compare.data
      : null
  const runCompare = (fresh = false, nextRegion = region) =>
    product && compare.mutate({ product, region: nextRegion, fresh })
  const externalAgentName =
    selectedProvider?.kind === 'acp' ? selectedProvider.name : undefined
  const privacyApplies = Boolean(
    privacy && privacy.level !== 'off' && !externalAgentName,
  )
  const [confirm, setConfirm] = useState<
    (PrivacyConfirmRequest & { text: string }) | null
  >(null)
  const [input, setInput] = useState('')
  const [attachedTabs, setAttachedTabs] = useState<chrome.tabs.Tab[]>([])
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    ;(async () => {
      const currentTab = (
        await chrome.tabs.query({
          active: true,
          currentWindow: true,
        })
      ).filter((tab) => tab.url?.startsWith('http'))
      setAttachedTabs(currentTab)
    })()
  }, [])

  // Trigger JTBD popup when AI finishes responding
  const previousChatStatus = useRef(status)
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally only trigger on status change
  useEffect(() => {
    const aiWasProcessing =
      previousChatStatus.current === 'streaming' ||
      previousChatStatus.current === 'submitted'
    const aiJustFinished = aiWasProcessing && status === 'ready'

    if (aiJustFinished && messages.length > 0) {
      triggerIfEligible()
    }
    previousChatStatus.current = status
  }, [status])

  const handleModeChange = (newMode: ChatMode) => {
    track(SIDEPANEL_MODE_CHANGED_EVENT, { from: mode, to: newMode })
    setMode(newMode)
  }

  const handleStop = () => {
    track(SIDEPANEL_STOP_CLICKED_EVENT)
    stop()
  }

  const toggleTabSelection = (tab: chrome.tabs.Tab) => {
    setAttachedTabs((prev) => {
      const isSelected = prev.some((t) => t.id === tab.id)
      track(SIDEPANEL_TAB_TOGGLED_EVENT, {
        action: isSelected ? 'removed' : 'added',
      })
      if (isSelected) {
        return prev.filter((t) => t.id !== tab.id)
      }
      return [...prev, tab]
    })
  }

  const removeTab = (tabId?: number) => {
    track(SIDEPANEL_TAB_REMOVED_EVENT)
    setAttachedTabs((prev) => prev.filter((t) => t.id !== tabId))
  }

  /** At Strict, a message holding private details is confirmed first; Edit keeps the draft. */
  const executeMessage = (customMessageText?: string) => {
    const messageText = customMessageText ? customMessageText : input.trim()
    if (!messageText) return
    if (privacy?.level === 'strict' && privacyApplies) {
      const pieces = splitPrivate(messageText, privacy.level, privacy.names)
      const count = privateCount(pieces)
      if (count > 0) {
        setConfirm({ count, kinds: privateKinds(pieces), text: messageText })
        return
      }
    }
    sendNow(messageText)
  }

  const sendNow = (messageText: string) => {
    recordMessageSent()

    const sent = attachedTabs.length
      ? sendMessage({
          text: messageText,
          action: createBrowserOSAction({
            mode,
            message: messageText,
            tabs: attachedTabs,
          }),
        })
      : sendMessage({ text: messageText })

    // Keep the draft when the send did not happen. Clearing unconditionally
    // threw away what the user typed whenever sendMessage refused, which is
    // every send made with nothing connected.
    if (!sent) return
    setInput('')
    setAttachedTabs([])
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (messages.length === 0) {
      track(SIDEPANEL_AI_TRIGGERED_EVENT, {
        mode,
        tabs_count: attachedTabs.length,
      })
    }
    executeMessage()
  }

  const handleSuggestionClick = (suggestion: string) => {
    track(SIDEPANEL_SUGGESTION_CLICKED_EVENT, { mode })
    executeMessage(suggestion)
  }

  const chatErrorProps = buildChatErrorProps({
    chatError,
    selectedProvider,
    retryLastTurn,
  })

  return (
    <>
      <main className="mt-4 flex h-full flex-1 flex-col space-y-4 overflow-y-auto">
        {isRestoringConversation ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 &&
          (comparison ||
            playbookPanel.showing ||
            jobs.open ||
            hiring.card ||
            hiring.reviewedList) ? null : messages.length === 0 ? (
          <ChatEmptyState
            mode={mode}
            mounted={mounted}
            onSuggestionClick={handleSuggestionClick}
          />
        ) : (
          <ChatMessages
            privacy={privacyApplies ? privacy : undefined}
            messages={messages}
            status={status}
            getActionForMessage={getActionForMessage}
            liked={liked}
            onClickLike={onClickLike}
            disliked={disliked}
            onClickDislike={onClickDislike}
            showJtbdPopup={popupVisible}
            showDontShowAgain={showDontShowAgain}
            onTakeSurvey={onTakeSurvey}
            onDismissJtbdPopup={onDismissJtbdPopup}
            onReplySuggestionClick={handleSuggestionClick}
          />
        )}
        <PlaybookPanels panel={playbookPanel} />
        <JobPanels panel={jobs} />
        <HiringPanels panel={hiring} />
        {comparison ? (
          <SmartCompareCard
            result={comparison}
            region={region}
            refreshing={compare.isPending}
            onRefresh={() => runCompare(true)}
            onRegionChange={(next) => {
              setRegion(next)
              runCompare(false, next)
            }}
          />
        ) : null}
        {compare.isError ? (
          <ChatError
            error={new Error(t('compareFailed'))}
            providerType={selectedProvider?.type}
          />
        ) : null}
        {agentUrlError && (
          <ChatError
            error={agentUrlError}
            providerType={selectedProvider?.type}
          />
        )}
        {chatErrorProps && <ChatError {...chatErrorProps} />}
        {isSettled && !hasAnyTarget && (
          <NoProviderNotice blocked={sendBlocked} />
        )}
      </main>

      {isIncognito && <IncognitoNotice />}

      <ChatFooter
        mode={mode}
        onModeChange={handleModeChange}
        input={input}
        onInputChange={setInput}
        onSubmit={handleSubmit}
        status={status}
        onStop={handleStop}
        sendDisabled={!canSend}
        attachedTabs={attachedTabs}
        onToggleTab={toggleTabSelection}
        onRemoveTab={removeTab}
        externalAgentName={externalAgentName}
        moments={
          (product && !comparison) ||
          runChips.length ||
          jobs.hasChips ||
          hiring.hasChips ? (
            <>
              <JobChips panel={jobs} />
              <HiringChips panel={hiring} />
              {product && !comparison ? (
                <SmartCompareChip
                  region={region}
                  busy={compare.isPending}
                  onCompare={() => runCompare()}
                />
              ) : null}
              {runChips.map((playbook) => (
                <button
                  key={playbook.id}
                  type="button"
                  className="rr-prompt"
                  onClick={() => playbookPanel.setRunning(playbook)}
                >
                  {t('playbookRunNamed', playbook.name)}
                </button>
              ))}
            </>
          ) : null
        }
        onTeach={playbookPanel.onTeach}
      />
      <PrivacyConfirmDialog
        request={confirm}
        onEdit={() => setConfirm(null)}
        onSend={() => {
          const text = confirm?.text
          setConfirm(null)
          if (text) sendNow(text)
        }}
      />
    </>
  )
}
