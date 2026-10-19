/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

export const BROWSEROS_ONBOARDING_API_VERSION = 1 as const

export type BrowserOSImportItem =
  | 'history'
  | 'bookmarks'
  | 'cookies'
  | 'passwords'
  | 'searchEngines'
  | 'autofill'
  | 'extensions'

export type BrowserOSImportStatus =
  | 'idle'
  | 'detecting'
  | 'ready'
  | 'importing'
  | 'succeeded'
  | 'failed'
  | 'completed'
  /** The user stopped the import; anything already copied stays. */
  | 'cancelled'

/** Native owns extension preparation independently of the browser-data importer. */
export type BrowserOSSetupState = 'idle' | 'preparing' | 'failed' | 'ready'

export const BrowserOSOnboardingMessage = {
  PAGE_READY: 'browserosOnboardingPageReady',
  REFRESH_SOURCES: 'browserosOnboardingRefreshSources',
  START_IMPORT: 'browserosOnboardingStartImport',
  COMPLETE: 'browserosOnboardingComplete',
  RETRY_SETUP: 'browserosOnboardingRetrySetup',
  CANCEL_IMPORT: 'browserosOnboardingCancelImport',
} as const

export type BrowserOSOnboardingMessage =
  (typeof BrowserOSOnboardingMessage)[keyof typeof BrowserOSOnboardingMessage]

export interface BrowserOSImportSource {
  id: string
  displayName: string
  browserName: string
  profileName: string
  accountName: string
  isManaged: boolean
  supportedItems: BrowserOSImportItem[]
  recommendedItems: BrowserOSImportItem[]
  /** Browser family, e.g. 'firefox', 'safari', 'chromium'. Absent from older native builds. */
  kind?: string
  /** Saved passwords are not copied from this source; the step offers the CSV export route. */
  passwordsViaCsv?: boolean
}

export interface BrowserOSImportProgress {
  currentItem?: BrowserOSImportItem
  currentSourceId?: string
  currentSourceName?: string
  completedItems: BrowserOSImportItem[]
  totalItems: number
  completedSources?: number
  totalSources?: number
}

export interface BrowserOSOnboardingError {
  code: string
  message: string
}

export type BrowserOSImportSourceResultStatus =
  | 'importing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export interface BrowserOSImportSourceResult {
  sourceId: string
  displayName: string
  status: BrowserOSImportSourceResultStatus
}

export interface BrowserOSOnboardingState {
  apiVersion: typeof BROWSEROS_ONBOARDING_API_VERSION
  status: BrowserOSImportStatus
  /** Optional under API v1 because Chromium and these resources ship separately. */
  setupState?: BrowserOSSetupState
  sources: BrowserOSImportSource[]
  progress?: BrowserOSImportProgress
  error?: BrowserOSOnboardingError
  /** Single-source imports report one per-source result. */
  results?: BrowserOSImportSourceResult[]
}

/** Starts one source import from the visible Import action; Chromium rejects hidden/non-interactive requests for macOS keychain safety. */
export interface BrowserOSStartImportRequest {
  sourceId: string
  items?: BrowserOSImportItem[]
}

export interface BrowserOSOnboardingClient {
  receiveState(state: BrowserOSOnboardingState): void
}

export interface BrowserOSOnboardingChrome {
  send(message: BrowserOSOnboardingMessage, args?: unknown[]): void
}

declare global {
  interface Window {
    browserosOnboarding?: BrowserOSOnboardingClient
  }

  const chrome: BrowserOSOnboardingChrome
}
