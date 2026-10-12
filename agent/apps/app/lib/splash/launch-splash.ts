/**
 * The Redrob Browser launch splash (Redrob Design System 2026): the Redrob lockup
 * (Primary on light, Primary White on dark), then the Browser icon with
 * "Redrob Browser" in Pretendard SemiBold.
 *
 * It plays on the first new tab of a browser session only. sessionStorage is per
 * tab, so the gate is chrome.storage.session, which is shared by every tab and
 * cleared when the browser quits. Never inside a frame, and never on a deep link
 * (settings, a task) - only the new tab itself.
 */

import logoLight from './redrob-logo-primary.png'
import logoDark from './redrob-logo-primary-white.png'
import { showRedrobSplash } from './redrob-splash.js'
import './redrob-splash.css'

const SEEN_KEY = 'redrob-splash:browser'

function isNewTab(): boolean {
  if (window.top !== window) return false
  const route = window.location.hash.replace(/^#\/?/, '')
  return route === ''
}

async function takeOnce(): Promise<boolean> {
  try {
    const area = chrome.storage.session
    const got = await area.get(SEEN_KEY)
    if (got[SEEN_KEY]) return false
    await area.set({ [SEEN_KEY]: true })
    return true
  } catch {
    return false // no session storage: skip the splash rather than show it on every tab
  }
}

function currentTheme(stored: unknown): 'light' | 'dark' | 'system' {
  return stored === 'light' || stored === 'dark' ? stored : 'system'
}

/** Show the splash when this is the session's first new tab; resolves at once otherwise. */
export async function maybeShowLaunchSplash(
  theme: Promise<unknown>,
  ready: Promise<unknown>,
): Promise<void> {
  if (!isNewTab()) return
  // The once-per-session read is async; keep the page from painting under it for those few ms.
  const html = document.documentElement
  html.classList.add('rs-splash-pending')
  let shown: Promise<void> = Promise.resolve()
  try {
    if (await takeOnce()) {
      shown = showRedrobSplash({
        logoLight,
        logoDark,
        theme: currentTheme(await theme.catch(() => 'system')),
        once: false,
        ready,
      })
    }
  } finally {
    // the splash (if any) is in the DOM by now and covers the page
    html.classList.remove('rs-splash-pending')
  }
  await shown
}
