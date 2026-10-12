/**
 * @license
 * Copyright 2026 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure helpers for the cockpit onboarding block. The Cockpit screen
 * reads live query state, feeds the two derived booleans through
 * `getOnboardingState()`, and renders the returned discriminant.
 *
 * Keeping the selector pure means every state variant is trivially
 * unit-testable without React. The onboarding component consumes the
 * discriminant and the copy constants; it never re-derives state.
 */

import { t } from '@browseros/i18n'

export type OnboardingState = 'first-run' | 'waiting' | 'ready'

export interface OnboardingSignals {
  /** True when at least one MCP connection is installed. */
  hasConnection: boolean
  /** True when the recent-activity list has at least one task row. */
  hasActivity: boolean
}

/**
 * Discriminant for the cockpit view. `ready` means the reader has
 * already completed the loop at least once, so the normal cockpit
 * renders unchanged.
 */
export function getOnboardingState({
  hasConnection,
  hasActivity,
}: OnboardingSignals): OnboardingState {
  if (hasActivity) return 'ready'
  if (hasConnection) return 'waiting'
  return 'first-run'
}

export const HERO_COPY = {
  eyebrow: t('clWelcome'),
  h1Prefix: t('clYouWatchPrefix'),
  h1Accent: t('clWorks'),
  subhead: t('clOnboardSubhead'),
} as const

export const PANEL_COPY = {
  heading: t('clHandOffYourFirstTask'),
  // Three status messages share one fixed-height slot so copying never
  // reflows the panel. Keep each to at most two lines at panel width.
  tieBack: t('clTieBack'),
  waiting: t('clWaitingFirstRun'),
  copied: t('clCopiedPasteIt'),
} as const

export const MANAGE_COPY = {
  label: t('clManageAgents'),
  href: '/mcp',
} as const

export const STARTER_PROMPT_LABEL = t('clPasteThisPrompt')

/** The task a person pastes into their agent, so it is in their language too. */
export const STARTER_PROMPT = t('clStarterPrompt')

export const CONNECTED_COPY = {
  suffix: t('clConnectedSuffix'),
} as const

export const FOOTER_COPY = {
  docs: t('clReadDocs'),
  // Deep-link to the BrowserClaw section instead of the docs root
  // so a first-run reader lands on install / first-run / MCP setup
  // instead of BrowserOS's general index. Mintlify canonicalises
  // the URL without a trailing slash, so we use the no-slash form
  // to avoid triggering a redirect on every click.
  docsHref: 'https://docs.redrob.ai/guide',
} as const
