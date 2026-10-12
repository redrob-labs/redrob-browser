/**
 * @license
 * Copyright 2026 Redrob and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * One theme for the window and the pages in it.
 *
 * The extension used to keep its own `local:theme`, so the side panel could be dark beside a light
 * window. The source of truth is now the BROWSER's colour scheme (ThemeService's BrowserColorScheme, the
 * setting chrome://settings/appearance writes), read and written through redrobPrivate.getColorScheme /
 * setColorScheme. Choosing a theme in the extension re-themes the window; choosing one in the browser's
 * Settings re-themes the extension the next time a page is shown.
 *
 * Two copies are kept on purpose, and neither is a second source:
 *  - `local:theme` in chrome.storage, so every open page of this extension hears a change at once
 *    (themeStorage.watch) without polling the browser;
 *  - a synchronous localStorage mirror, read before React renders, so a dark page never paints one
 *    white frame while the async APIs answer.
 * Both are written FROM the browser's value. When redrobPrivate is unavailable (a dev build in stock
 * Chromium, the UI capture harness) they are the only store, which is the previous behaviour.
 */

import type { Theme } from './theme-storage'
import { themeStorage } from './theme-storage'

const MIRROR = 'redrob.theme'

type ColorSchemeApi = {
  getColorScheme(callback: (scheme: string) => void): void
  setColorScheme(scheme: string): void
}

function api(): ColorSchemeApi | null {
  const candidate = (
    globalThis as { chrome?: { redrobPrivate?: Partial<ColorSchemeApi> } }
  ).chrome?.redrobPrivate
  return typeof candidate?.getColorScheme === 'function' &&
    typeof candidate.setColorScheme === 'function'
    ? (candidate as ColorSchemeApi)
    : null
}

const isTheme = (value: unknown): value is Theme =>
  value === 'system' || value === 'light' || value === 'dark'

/** The last known choice, synchronously, for the first paint. */
export function mirroredTheme(): Theme {
  try {
    const v = globalThis.localStorage?.getItem(MIRROR)
    return isTheme(v) ? v : 'system'
  } catch {
    return 'system'
  }
}

function mirror(theme: Theme): void {
  try {
    globalThis.localStorage?.setItem(MIRROR, theme)
  } catch {
    // A context without storage still themes correctly; it only loses the no-flash first frame.
  }
}

/** Reads the browser's scheme (or the local store without the API) and brings both copies up to it. */
export async function readTheme(): Promise<Theme> {
  const browser = api()
  let theme: Theme
  if (browser) {
    theme = await new Promise<Theme>((resolve) =>
      browser.getColorScheme((scheme) =>
        resolve(isTheme(scheme) ? scheme : 'system'),
      ),
    )
    if ((await themeStorage.getValue()) !== theme)
      await themeStorage.setValue(theme)
  } else {
    theme = (await themeStorage.getValue()) ?? 'system'
  }
  mirror(theme)
  return theme
}

/** Writes the choice to the browser, which re-themes the window, and to both copies. */
export async function writeTheme(theme: Theme): Promise<void> {
  api()?.setColorScheme(theme)
  mirror(theme)
  await themeStorage.setValue(theme)
}

/** The theme a document should paint now: an explicit choice, or the platform's. */
export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

/** Sets both markers the stylesheets read: [data-theme] for the design system, .dark for shadcn. */
export function applyTheme(
  resolved: 'light' | 'dark',
  root: HTMLElement = document.documentElement,
): void {
  root.classList.toggle('dark', resolved === 'dark')
  root.classList.toggle('light', resolved === 'light')
  root.dataset.theme = resolved
}
