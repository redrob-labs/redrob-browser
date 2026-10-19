/**
 * @license
 * Copyright 2026 Redrob and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The quick window's half of redrobPrivate (CAP-5).
 *
 * The quick window is a native always-on-top window the browser opens on a global shortcut; this
 * extension's `#/quick` route is the page inside it. Starting a task from it goes through
 * redrobPrivate.startQuickTask, which opens the SAME `#/home/chat?q=…&mode=agent` route the new tab and
 * the address bar's agent mode open, in the last active browser window, and closes the quick window.
 *
 * Every call degrades when redrobPrivate is absent (a dev build in stock Chromium, the UI capture
 * harness): the page then opens the chat route itself and closes with window.close().
 */

export type QuickWindowShortcut =
  | 'primary_shift_space'
  | 'alt_shift_space'
  | 'off'

export const QUICK_WINDOW_SHORTCUTS: readonly QuickWindowShortcut[] = [
  'primary_shift_space',
  'alt_shift_space',
  'off',
]

type QuickWindowApi = {
  getQuickWindowShortcut(callback: (preset: string) => void): void
  setQuickWindowShortcut(preset: string): void
  startQuickTask(prompt: string): void
  closeQuickWindow(): void
}

function api(): QuickWindowApi | null {
  const candidate = (
    globalThis as { chrome?: { redrobPrivate?: Partial<QuickWindowApi> } }
  ).chrome?.redrobPrivate
  return typeof candidate?.startQuickTask === 'function' &&
    typeof candidate.closeQuickWindow === 'function' &&
    typeof candidate.getQuickWindowShortcut === 'function' &&
    typeof candidate.setQuickWindowShortcut === 'function'
    ? (candidate as QuickWindowApi)
    : null
}

const isShortcut = (value: unknown): value is QuickWindowShortcut =>
  QUICK_WINDOW_SHORTCUTS.includes(value as QuickWindowShortcut)

export function isQuickWindowApiAvailable(): boolean {
  return api() !== null
}

export async function getQuickWindowShortcut(): Promise<QuickWindowShortcut> {
  const browser = api()
  if (!browser) return 'primary_shift_space'
  return new Promise((resolve) =>
    browser.getQuickWindowShortcut((preset) =>
      resolve(isShortcut(preset) ? preset : 'off'),
    ),
  )
}

export function setQuickWindowShortcut(preset: QuickWindowShortcut): void {
  api()?.setQuickWindowShortcut(preset)
}

/** The shortcut as a person reads it on this platform. */
export function shortcutLabel(
  preset: QuickWindowShortcut,
  isMac: boolean,
): string | null {
  switch (preset) {
    case 'primary_shift_space':
      return isMac ? '⌘ ⇧ Space' : 'Ctrl + Shift + Space'
    case 'alt_shift_space':
      return isMac ? '⌥ ⇧ Space' : 'Alt + Shift + Space'
    default:
      return null
  }
}

/** Opens `url` (an extension page) in the last focused normal window, or a new one. */
async function openInLastWindow(url: string): Promise<void> {
  try {
    const last = await chrome.windows.getLastFocused({
      windowTypes: ['normal'],
    })
    if (last?.id !== undefined) {
      await chrome.tabs.create({ windowId: last.id, url, active: true })
      await chrome.windows.update(last.id, { focused: true })
      return
    }
  } catch {
    // No normal window: fall through and make one.
  }
  await chrome.windows.create({ url, focused: true })
}

export function closeQuickWindow(): void {
  const browser = api()
  if (browser) {
    browser.closeQuickWindow()
  } else {
    window.close()
  }
}

/** Hands `prompt` to the agent: the same chat route the new tab opens. */
export async function startQuickTask(prompt: string): Promise<void> {
  const text = prompt.trim()
  if (!text) return
  const browser = api()
  if (browser) {
    browser.startQuickTask(text)
    return
  }
  const search = new URLSearchParams({ q: text, mode: 'agent' })
  await openInLastWindow(chrome.runtime.getURL(`/app.html#/home/chat?${search}`))
  window.close()
}

/** Reopens an earlier conversation in the browser and closes the quick window. */
export async function openConversation(conversationId: string): Promise<void> {
  const url = chrome.runtime.getURL(
    `/app.html#/home/chat?conversationId=${encodeURIComponent(conversationId)}`,
  )
  await openInLastWindow(url)
  closeQuickWindow()
}
