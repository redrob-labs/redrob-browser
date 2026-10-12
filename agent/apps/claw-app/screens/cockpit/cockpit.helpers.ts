/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import type {
  HelpRequest,
  LiveSessionActivityState,
  SessionBrowserTab,
  SessionSummary,
  ToolEvent,
} from '@browseros/claw-api'
import { t } from '@browseros/i18n'

// Missing parent colors fall back to a stable slug hash so card identity does
// not flicker between live-session polls.
// The design system's data-series palette (--series-1..6, light values), written out because a session's
// colour also travels to the server and the tab-group strip as a hex.
const PALETTE = [
  '#2B52FF',
  '#AE5100',
  '#8944FF',
  '#00864A',
  '#A31310',
  '#D2A100',
]

const TRAIL_DISPLAY_CAP = 4
const MERGED_TRAIL_CAP = 8

export function colorForSlug(slug: string): string {
  let hash = 0
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0
  }
  return PALETTE[hash % PALETTE.length] ?? PALETTE[0]
}

export function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function formatRelative(ms: number, now: number): string {
  const delta = Math.max(0, now - ms)
  const seconds = Math.floor(delta / 1000)
  if (seconds < 60) return t('clSecondsAgo', seconds)
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return t('clMinutesAgo', minutes)
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('clHoursAgo', hours)
  const days = Math.floor(hours / 24)
  return t('clDaysAgo', days)
}

/** Returns the most recent N tool names joined for compact card trail rows. */
export function formatToolTrail(
  recentTools: ToolEvent[],
  max: number = TRAIL_DISPLAY_CAP,
): string {
  if (recentTools.length === 0) return ''
  return recentTools
    .slice(-max)
    .map((tool) => tool.name)
    .join(' -> ')
}

export interface LiveSessionCardRecord {
  sessionId: string
  profileId?: string
  slug: string
  label: string
  name: string
  color: string
  startedAt: number
  state: LiveSessionActivityState
  selectedTab: SessionBrowserTab | null
  browserTabs: SessionBrowserTab[]
  toolCount: number
  recentTools: ToolEvent[]
  /** Present only while the agent is parked waiting for a human on this session. */
  helpRequest?: HelpRequest
}

export interface LiveSessionCardOptions {
  /** Previous selection keyed by session id and carrying a Chrome tab id. */
  stickySelection?: ReadonlyMap<string, number>
}

function activityAt(tab: SessionBrowserTab): number | undefined {
  return tab.lastActivityAt ?? tab.firstActivityAt
}

function compareBrowserTabs(
  left: SessionBrowserTab,
  right: SessionBrowserTab,
): number {
  const leftActivity = activityAt(left)
  const rightActivity = activityAt(right)
  if (leftActivity === undefined && rightActivity !== undefined) return 1
  if (leftActivity !== undefined && rightActivity === undefined) return -1
  if (leftActivity !== undefined && rightActivity !== undefined) {
    const byActivity = rightActivity - leftActivity
    if (byActivity !== 0) return byActivity
  }
  return left.browserTabId - right.browserTabId
}

/**
 * Projects each connected session into one card. A previous browser-tab id
 * remains selected while owned; otherwise activity freshness and then Chrome
 * tab id provide deterministic election. Card order follows session arrival.
 */
export function sessionsToLiveCards(
  sessions: SessionSummary[],
  options?: LiveSessionCardOptions,
): LiveSessionCardRecord[] {
  const cards = sessions.map((session) => {
    const browserTabs = [...(session.live?.browserTabs ?? [])].sort(
      compareBrowserTabs,
    )
    const previousSelection = options?.stickySelection?.get(session.sessionId)
    const selectedTab =
      browserTabs.find((tab) => tab.browserTabId === previousSelection) ??
      browserTabs[0] ??
      null
    const recentTools = browserTabs
      .flatMap((tab) => tab.recentTools)
      .sort((left, right) => left.at - right.at)
      .slice(-MERGED_TRAIL_CAP)

    return {
      sessionId: session.sessionId,
      profileId: session.profileId,
      slug: session.slug,
      label: session.label || session.slug,
      name: session.name,
      color: session.color ?? colorForSlug(session.slug),
      startedAt: session.startedAt,
      state: session.live?.state ?? 'idle',
      selectedTab,
      browserTabs,
      toolCount: browserTabs.reduce((sum, tab) => sum + tab.toolCount, 0),
      recentTools,
      helpRequest: session.live?.helpRequest,
    }
  })

  return cards.sort(
    (left, right) =>
      left.startedAt - right.startedAt ||
      left.sessionId.localeCompare(right.sessionId),
  )
}
