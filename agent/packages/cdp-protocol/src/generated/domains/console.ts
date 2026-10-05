/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

// ── AUTO-GENERATED from CDP protocol. DO NOT EDIT. ──

// ══ Types ══

export interface ConsoleMessage {
  source:
    | 'xml'
    | 'javascript'
    | 'network'
    | 'console-api'
    | 'storage'
    | 'appcache'
    | 'rendering'
    | 'security'
    | 'other'
    | 'deprecation'
    | 'worker'
  level: 'log' | 'warning' | 'error' | 'debug' | 'info'
  text: string
  url?: string
  line?: number
  column?: number
}

// ══ Commands ══

// ══ Events ══

export interface MessageAddedEvent {
  message: ConsoleMessage
}
