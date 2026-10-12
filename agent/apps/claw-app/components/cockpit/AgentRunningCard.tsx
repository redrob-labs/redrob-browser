/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import type { HelpRequest } from '@browseros/claw-api'
import { t } from '@browseros/i18n'
import { ExternalLink, Hand, RefreshCw, Square } from '@browseros/icons'
import { cn } from '@/lib/utils'
import type { LiveSessionCardRecord } from '@/screens/cockpit/cockpit.helpers'
import { formatToolTrail, siteOf } from '@/screens/cockpit/cockpit.helpers'
import { activityCardCaptionTones } from './activityCardTone'
import { MiniScreencast } from './MiniScreencast'
import { needsYouTone } from './needsYouTone'
import { TabCountChip } from './TabCountChip'

type BrowserTabRecord = LiveSessionCardRecord['browserTabs'][number]

function formatWait(requestedAt: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - requestedAt) / 1000))
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

interface SessionRunningCardProps {
  session: LiveSessionCardRecord
  /** The owned tab shown on the card: the reader's pick, else the live target. */
  selectedBrowserTabId?: number
  /** The session's current live target tab, for the live-versus-last-frame marker. */
  liveBrowserTabId?: number
  /** True once the reader pins a tab instead of following the live target. */
  pinned?: boolean
  onSelectTab?: (browserTabId: number) => void
  onFollowLive?: () => void
  onWatch?: () => void
  onTakeOver?: () => void
  onStop: () => void
  isFocusPending?: boolean
  isCancelPending?: boolean
}

/**
 * One card per connected session in the Running now strip. The shown browser
 * tab's latest screenshot dominates the top; the caption carries parent session
 * identity, recent tools, and Watch / Stop actions. The tab chip switches which
 * owned tab the card previews. A pinned tab keeps its own screenshot while the
 * LIVE marker follows the agent's current target.
 *
 * The LIVE indicator uses light blue rather than the vivid brand accent, which
 * is near-invisible on the saturated blue caption block.
 */
export function AgentRunningCard({
  session,
  selectedBrowserTabId,
  liveBrowserTabId,
  pinned,
  onSelectTab,
  onFollowLive,
  onWatch,
  onTakeOver,
  onStop,
  isFocusPending,
  isCancelPending,
}: SessionRunningCardProps) {
  const shownTab =
    session.browserTabs.find(
      (tab) => tab.browserTabId === selectedBrowserTabId,
    ) ?? session.browserTabs[0]
  const active = session.state === 'active'
  const isLiveTab =
    shownTab != null && shownTab.browserTabId === liveBrowserTabId
  const showingLive = active && isLiveTab
  const trail = formatToolTrail(session.recentTools)
  const site = shownTab ? siteOf(shownTab.url) : t('clNoBrowserActivity')
  const help = session.helpRequest
  const needsHelp = help != null

  if (needsHelp) {
    return (
      <AgentNeedsYouCard
        session={session}
        help={help}
        shownTab={shownTab}
        site={site}
        liveBrowserTabId={liveBrowserTabId}
        onSelectTab={onSelectTab}
        onTakeOver={onTakeOver}
        onStop={onStop}
        isFocusPending={isFocusPending}
        isCancelPending={isCancelPending}
      />
    )
  }

  return (
    <div
      data-session-card={session.sessionId}
      className="group relative flex h-[300px] flex-col overflow-hidden rounded-2xl border border-border-2 bg-bg-sunken transition-[border-color] duration-150 hover:border-accent/40"
    >
      <div className="relative flex-1 overflow-hidden">
        {/* rrweb players retained played events until card teardown, causing
            unbounded heap growth and reproduced renderer OOM crashes. Cards
            only need the latest image; keep rrweb on the dedicated Replay view. */}
        <MiniScreencast
          site={site}
          live={showingLive}
          sessionId={session.sessionId}
          browserTabId={shownTab?.browserTabId}
          className="h-full w-full"
        />
        {shownTab && onSelectTab && (
          <div className="absolute top-3 right-3">
            <TabCountChip
              browserTabs={session.browserTabs}
              selectedBrowserTabId={shownTab.browserTabId}
              liveBrowserTabId={liveBrowserTabId}
              onSelectTab={onSelectTab}
            />
          </div>
        )}
      </div>
      <div
        className={cn(
          'flex flex-col gap-1.5 px-4 py-3',
          activityCardCaptionTones.blue.surface,
        )}
        data-caption-tone="blue"
      >
        <div className="flex items-center gap-3 font-mono text-[10.5px] text-[var(--blue-1)] uppercase tracking-[0.08em]">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block size-2 shrink-0 rounded-full"
              style={{ background: session.color }}
            />
            <span className="truncate text-white" translate="no">
              {session.label}
            </span>
          </span>
          {showingLive ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 text-white">
              <span
                aria-hidden
                className="inline-block size-1.5 animate-[pulse-dot_1.4s_ease-in-out_infinite] rounded-full bg-white"
              />
              {t('clLive2')}
            </span>
          ) : active && pinned && !isLiveTab ? (
            <span className="inline-flex shrink-0 items-center gap-2 text-[var(--blue-1)]">
              {t('clLastFrame')}
              {onFollowLive && (
                <button
                  type="button"
                  data-follow-live={session.sessionId}
                  onClick={onFollowLive}
                  className="text-white uppercase tracking-[0.08em] underline-offset-2 transition hover:underline"
                >
                  {t('clFollowLive')}
                </button>
              )}
            </span>
          ) : (
            <span className="shrink-0 text-[var(--blue-1)]">{t('clIdle')}</span>
          )}
        </div>
        <h3 className="truncate font-semibold text-[14px] text-white leading-tight">
          {shownTab?.title || session.name || site}
        </h3>
        {/* The tool trail and the site are data; the waiting line is copy. */}
        <p
          className="truncate font-mono text-[11px] text-[var(--blue-1)]"
          translate={trail || shownTab ? 'no' : undefined}
        >
          {trail || (shownTab ? site : t('clWaitingBrowserActivity'))}
        </p>
        <div className="mt-1 flex items-center gap-2 border-[var(--blue-5)] border-t pt-2">
          {shownTab && onWatch && (
            <button
              type="button"
              data-watch-browser-tab={shownTab.browserTabId}
              onClick={onWatch}
              disabled={isFocusPending}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-[var(--blue-7)] px-2 py-1.5 font-mono text-[10.5px] text-white uppercase tracking-[0.08em] transition hover:bg-[var(--blue-8)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isFocusPending ? (
                <RefreshCw className="size-3 animate-spin" />
              ) : (
                <ExternalLink className="size-3" />
              )}
              {t('clWatch')}
            </button>
          )}
          <button
            type="button"
            data-stop-session={session.sessionId}
            onClick={onStop}
            disabled={isCancelPending}
            aria-label={
              isCancelPending ? t('clCancellingSession') : t('clStopSession')
            }
            // min-w reserves enough width for the longer pending label so
            // swapping states does not push the adjacent Watch button around.
            className="inline-flex min-w-[92px] flex-1 items-center justify-center gap-1.5 rounded-md bg-[var(--blue-7)] px-2 py-1.5 font-mono text-[10.5px] text-white uppercase tracking-[0.08em] transition hover:bg-[var(--accent-red-4)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCancelPending ? (
              <>
                <RefreshCw className="size-3 animate-spin" />{' '}
                {t('clCancelling')}
              </>
            ) : (
              <>
                <Square className="size-3" /> {t('clStop')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

interface AgentNeedsYouCardProps {
  session: LiveSessionCardRecord
  help: HelpRequest
  shownTab?: BrowserTabRecord
  site: string
  liveBrowserTabId?: number
  onSelectTab?: (browserTabId: number) => void
  onTakeOver?: () => void
  onStop: () => void
  isFocusPending?: boolean
  isCancelPending?: boolean
}

/**
 * The needs-you state of a running card: a blocked agent that has asked for a
 * human. The live preview shows the actual blocking page (a login or captcha),
 * the caption carries the reason and a waiting timer, and the primary action
 * foregrounds the agent's tab so the human can act. Resolving happens from the
 * in-control bar, not here, so Take over only brings the page forward.
 */
function AgentNeedsYouCard({
  session,
  help,
  shownTab,
  site,
  liveBrowserTabId,
  onSelectTab,
  onTakeOver,
  onStop,
  isFocusPending,
  isCancelPending,
}: AgentNeedsYouCardProps) {
  const waiting = formatWait(help.requestedAt, Date.now())
  const context = help.url ? siteOf(help.url) : site

  return (
    <div
      data-session-card={session.sessionId}
      data-needs-you={session.sessionId}
      className="group relative flex h-[300px] flex-col overflow-hidden rounded-2xl border-2 border-[var(--accent-orange-4)] bg-bg-sunken"
    >
      <div className="relative flex-1 overflow-hidden">
        <MiniScreencast
          site={context}
          live
          sessionId={session.sessionId}
          browserTabId={shownTab?.browserTabId}
          className="h-full w-full"
        />
        <div className="absolute top-3 left-3">
          <span className="inline-flex items-center rounded-md bg-[var(--accent-orange-4)] px-2 py-1 font-mono text-[10px] text-white uppercase tracking-[0.1em] shadow-sm">
            {t('clPausedHere')}
          </span>
        </div>
        {shownTab && onSelectTab && (
          <div className="absolute top-3 right-3">
            <TabCountChip
              browserTabs={session.browserTabs}
              selectedBrowserTabId={shownTab.browserTabId}
              liveBrowserTabId={liveBrowserTabId}
              onSelectTab={onSelectTab}
            />
          </div>
        )}
      </div>
      <div
        className={cn('flex flex-col gap-1.5 px-4 py-3', needsYouTone.surface)}
        data-caption-tone="needs-you"
      >
        <div className="flex items-center gap-3 font-mono text-[10.5px] text-[var(--accent-orange-1)] uppercase tracking-[0.08em]">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block size-2 shrink-0 rounded-full"
              style={{ background: session.color }}
            />
            <span className="truncate text-white" translate="no">
              {session.label}
            </span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1.5 text-white">
            {t('clNeedsYou')}
            <span className="tabular-nums">{waiting}</span>
          </span>
        </div>
        <h3 className="truncate font-semibold text-[14px] text-white leading-tight">
          {help.reason}
        </h3>
        <p className="truncate font-mono text-[11px] text-[var(--accent-orange-1)]">
          {help.details || context}
        </p>
        <div className="mt-1 flex items-center gap-2 border-[var(--accent-orange-2)] border-t pt-2">
          <button
            type="button"
            data-take-over={session.sessionId}
            onClick={onTakeOver}
            disabled={isFocusPending}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-white px-2 py-1.5 font-mono text-[10.5px] text-[var(--accent-orange-4)] uppercase tracking-[0.08em] transition hover:bg-[var(--accent-orange-1)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isFocusPending ? (
              <RefreshCw className="size-3 animate-spin" />
            ) : (
              <Hand className="size-3" />
            )}
            {t('clTakeOver')}
          </button>
          <button
            type="button"
            data-stop-session={session.sessionId}
            onClick={onStop}
            disabled={isCancelPending}
            aria-label={
              isCancelPending ? t('clCancellingSession') : t('clStopSession')
            }
            className="inline-flex min-w-[92px] flex-1 items-center justify-center gap-1.5 rounded-md bg-[var(--accent-orange-5)] px-2 py-1.5 font-mono text-[10.5px] text-white uppercase tracking-[0.08em] transition hover:bg-[var(--accent-red-5)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCancelPending ? (
              <>
                <RefreshCw className="size-3 animate-spin" />{' '}
                {t('clCancelling')}
              </>
            ) : (
              <>
                <Square className="size-3" /> {t('clStop')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
