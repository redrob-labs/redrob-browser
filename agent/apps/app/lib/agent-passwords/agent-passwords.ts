/**
 * @license
 * Copyright 2026 Redrob and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The agent sign-in settings (CAP-9), over chrome.redrobPrivate. See docs/CREDENTIALS.md.
 *
 * Nothing here can read a password, by construction: the browser's settings tree is a policy, a list of
 * origins and an audit trail of usernames and outcomes. The passwords stay in the browser's own password
 * manager, which `openPasswordManager` opens.
 *
 * When redrobPrivate is missing (a dev build in stock Chromium, the UI capture harness) `available()` is
 * false and the page says so rather than rendering controls that change nothing.
 */

export type AgentCredentialPolicy = 'always' | 'whileUnlocked' | 'never'

export type AgentCredentialSite = { origin: string; allow: boolean }

export type AgentCredentialOutcome =
  | 'filled'
  | 'noSavedLogin'
  | 'refused'
  | 'locked'
  | 'severalLogins'
  | 'noSigninForm'
  | 'needsVerification'
  | 'failed'

export type AgentCredentialRecord = {
  timeMs: number
  origin: string
  username: string
  taskId: string
  outcome: string
}

export type AgentCredentialWait = {
  taskId: string
  prompt: string
  origin: string
  needsUnlock: boolean
}

export type AgentCredentialSettings = {
  policy: AgentCredentialPolicy
  unlockMinutes: number
  unlocked: boolean
  offTheRecord: boolean
  sites: AgentCredentialSite[]
  history: AgentCredentialRecord[]
  waiting: AgentCredentialWait[]
}

type Api = {
  getAgentCredentialSettings(cb: (s: AgentCredentialSettings) => void): void
  setAgentCredentialPolicy(policy: AgentCredentialPolicy): void
  setAgentCredentialUnlockMinutes(minutes: number): void
  setAgentCredentialSite(
    origin: string,
    allow: boolean,
    cb: (ok: boolean) => void,
  ): void
  removeAgentCredentialSite(origin: string, cb: (ok: boolean) => void): void
  unlockAgentCredentials(cb: (ok: boolean) => void): void
  lockAgentCredentials(): void
  resumeCredentialTask(taskId: string, cb: (ok: boolean) => void): void
  clearAgentCredentialHistory(): void
  openPasswordManager(): void
}

function api(): Api | null {
  const candidate = (
    globalThis as { chrome?: { redrobPrivate?: Partial<Api> } }
  ).chrome?.redrobPrivate
  return typeof candidate?.getAgentCredentialSettings === 'function'
    ? (candidate as Api)
    : null
}

export const available = (): boolean => api() !== null

function need(): Api {
  const browser = api()
  if (!browser) throw new Error('redrobPrivate is not available')
  return browser
}

export const getSettings = (): Promise<AgentCredentialSettings> =>
  new Promise((resolve) => need().getAgentCredentialSettings(resolve))

export const setPolicy = (policy: AgentCredentialPolicy): void =>
  need().setAgentCredentialPolicy(policy)

export const setUnlockMinutes = (minutes: number): void =>
  need().setAgentCredentialUnlockMinutes(minutes)

export const setSite = (origin: string, allow: boolean): Promise<boolean> =>
  new Promise((resolve) =>
    need().setAgentCredentialSite(origin, allow, resolve),
  )

export const removeSite = (origin: string): Promise<boolean> =>
  new Promise((resolve) =>
    need().removeAgentCredentialSite(origin, resolve),
  )

/** Opens the operating system's re-authentication over this page; resolves whether it succeeded. */
export const unlock = (): Promise<boolean> =>
  new Promise((resolve) => need().unlockAgentCredentials(resolve))

export const lock = (): void => need().lockAgentCredentials()

export const resumeTask = (taskId: string): Promise<boolean> =>
  new Promise((resolve) => need().resumeCredentialTask(taskId, resolve))

export const clearHistory = (): void => need().clearAgentCredentialHistory()

export const openPasswordManager = (): void => need().openPasswordManager()

/**
 * What the add-site field accepts: an http(s) URL, reduced to its origin, which is the key the browser
 * stores. The browser re-checks; this is only so the user hears about a typo before the round trip.
 */
export function toOrigin(input: string): string | null {
  try {
    const url = new URL(input.trim())
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.origin
  } catch {
    return null
  }
}
