/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

// ── AUTO-GENERATED from CDP protocol. DO NOT EDIT. ──

import type { FrameId } from './page'

// ══ Types ══

export interface CrashReportContextEntry {
  key: string
  value: string
  frameId: FrameId
}

// ══ Commands ══

export interface GetEntriesResult {
  entries: CrashReportContextEntry[]
}
