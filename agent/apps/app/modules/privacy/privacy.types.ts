/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * What `GET /privacy` returns (apps/server/src/lib/privacy/gate.ts, PrivacyGateStatus). Repeated here
 * rather than imported because the extension ships separately from the server: a server older than
 * this extension has no /privacy, and the hooks treat that as "unknown", not as "off".
 */

export type PrivacyLevel = 'off' | 'standard' | 'high' | 'strict'

export const PRIVACY_LEVELS: readonly PrivacyLevel[] = [
  'off',
  'standard',
  'high',
  'strict',
]

export type PrivacyDetectorStatus =
  | { state: 'ready'; model: string }
  | { state: 'not-loaded' }
  | { state: 'downloading'; receivedBytes: number; totalBytes: number }
  | { state: 'absent'; reason: string }
  | { state: 'failed'; reason: string }

export interface PrivacyStatus {
  level: PrivacyLevel
  names: string[][]
  neverReadSites: string[]
  keptThisWeek: number
  detector: PrivacyDetectorStatus
  coverage: { redrobAgent: boolean; externalAgents: boolean }
}

export interface PrivacyUpdate {
  level?: PrivacyLevel
  names?: string[][]
  neverReadSites?: string[]
}

/** 1, 2, 3 bars in the status line, as the design system's level meter draws them. */
export function levelBars(level: PrivacyLevel): number {
  return PRIVACY_LEVELS.indexOf(level)
}

/** Whether the level asks for the on-device model. */
export function usesModel(level: PrivacyLevel): boolean {
  return level === 'high' || level === 'strict'
}
