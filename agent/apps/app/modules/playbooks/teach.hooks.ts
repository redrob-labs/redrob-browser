/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { TeachEvent } from '@browseros/playbooks/teach'
import { useEffect, useState } from 'react'
import {
  endTeaching,
  type TeachSession,
  teachEventsStorage,
  teachSessionStorage,
} from '@/lib/playbooks/teachStorage'

export function useTeaching() {
  const [session, setSession] = useState<TeachSession | null>(null)
  const [events, setEvents] = useState<TeachEvent[]>([])
  useEffect(() => {
    void teachSessionStorage.getValue().then(setSession)
    void teachEventsStorage.getValue().then(setEvents)
    const a = teachSessionStorage.watch((next) => setSession(next ?? null))
    const b = teachEventsStorage.watch((next) => setEvents(next ?? []))
    return () => {
      a()
      b()
    }
  }, [])
  return {
    session,
    events,
    start: async () => {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      })
      if (tab?.id === undefined) return
      await teachEventsStorage.setValue([])
      await teachSessionStorage.setValue({
        tabIds: [tab.id],
        startedAt: Date.now(),
        paused: false,
      })
      // The recorder starts with a page load; reload so what is on screen is the first step.
      if (tab.url?.startsWith('https://')) await chrome.tabs.reload(tab.id)
    },
    setPaused: async (paused: boolean) => {
      const current = await teachSessionStorage.getValue()
      if (current) await teachSessionStorage.setValue({ ...current, paused })
    },
    finish: endTeaching,
  }
}

/** The URL of the active tab, following tab switches and navigations. */
export function useActiveTabUrl(): string | undefined {
  const [url, setUrl] = useState<string | undefined>()
  useEffect(() => {
    const read = () =>
      void chrome.tabs
        .query({ active: true, currentWindow: true })
        .then((tabs) => setUrl(tabs[0]?.url))
    read()
    const onUpdated = (_id: number, change: { url?: string }) =>
      change.url && read()
    chrome.tabs.onActivated.addListener(read)
    chrome.tabs.onUpdated.addListener(onUpdated)
    return () => {
      chrome.tabs.onActivated.removeListener(read)
      chrome.tabs.onUpdated.removeListener(onUpdated)
    }
  }, [])
  return url
}
