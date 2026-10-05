/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

// ── AUTO-GENERATED from CDP protocol. DO NOT EDIT. ──

import type { RequestId } from './network'
import type { RemoteObject, StackTrace, Timestamp } from './runtime'

// ══ Types ══

export interface LogEntry {
  source:
    | 'xml'
    | 'javascript'
    | 'network'
    | 'storage'
    | 'appcache'
    | 'rendering'
    | 'security'
    | 'deprecation'
    | 'worker'
    | 'violation'
    | 'intervention'
    | 'recommendation'
    | 'other'
  level: 'verbose' | 'info' | 'warning' | 'error'
  text: string
  category?: 'cors'
  timestamp: Timestamp
  url?: string
  lineNumber?: number
  stackTrace?: StackTrace
  networkRequestId?: RequestId
  workerId?: string
  args?: RemoteObject[]
}

export interface ViolationSetting {
  name:
    | 'longTask'
    | 'longLayout'
    | 'blockedEvent'
    | 'blockedParser'
    | 'discouragedAPIUse'
    | 'handler'
    | 'recurringHandler'
  threshold: number
}

// ══ Commands ══

export interface StartViolationsReportParams {
  config: ViolationSetting[]
}

// ══ Events ══

export interface EntryAddedEvent {
  entry: LogEntry
}
