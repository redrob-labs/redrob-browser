/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Teach Mode's state: which tabs are being taught, and what has been recorded. Local storage so the
 * recorder content script can append to it; cleared when the teaching ends either way.
 */

import type { TeachEvent } from '@browseros/playbooks/teach'
import { storage } from '@wxt-dev/storage'

export interface TeachSession {
  tabIds: number[]
  startedAt: number
  paused: boolean
}

export const teachSessionStorage = storage.defineItem<TeachSession | null>(
  'local:teach.session',
  { fallback: null },
)

export const teachEventsStorage = storage.defineItem<TeachEvent[]>(
  'local:teach.events',
  { fallback: [] },
)

export const MAX_TEACH_EVENTS = 2000

export async function endTeaching(): Promise<TeachEvent[]> {
  const events = await teachEventsStorage.getValue()
  await teachSessionStorage.setValue(null)
  await teachEventsStorage.setValue([])
  return events
}
