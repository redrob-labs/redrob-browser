/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { teachSessionStorage } from './teachStorage'

/** A tab opened from a tab being taught is taught too: a store's product link may open one. */
export function startTeachTabFollowing(): void {
  chrome.tabs.onCreated.addListener(async (tab) => {
    const session = await teachSessionStorage.getValue()
    if (!session || tab.id === undefined || tab.openerTabId === undefined)
      return
    if (!session.tabIds.includes(tab.openerTabId)) return
    await teachSessionStorage.setValue({
      ...session,
      tabIds: [...session.tabIds, tab.id],
    })
  })
}

/** A red dot on the toolbar button of every tab being taught, so recording is never invisible. */
export function startTeachBadge(): void {
  let painted: number[] = []
  const paint = async (
    session: { tabIds: number[]; paused: boolean } | null,
  ) => {
    for (const tabId of painted) {
      await chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {})
    }
    painted = session ? session.tabIds : []
    for (const tabId of painted) {
      await chrome.action
        .setBadgeText({ tabId, text: session?.paused ? '❚❚' : '●' })
        .catch(() => {})
      await chrome.action
        .setBadgeBackgroundColor({ tabId, color: '#D92D20' })
        .catch(() => {})
    }
  }
  void teachSessionStorage.getValue().then(paint)
  teachSessionStorage.watch((session) => void paint(session ?? null))
}
