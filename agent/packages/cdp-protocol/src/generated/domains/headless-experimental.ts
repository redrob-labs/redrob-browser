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

export interface ScreenshotParams {
  format?: 'jpeg' | 'png' | 'webp'
  quality?: number
  optimizeForSpeed?: boolean
}

// ══ Commands ══

export interface BeginFrameParams {
  frameTimeTicks?: number
  interval?: number
  noDisplayUpdates?: boolean
  screenshot?: ScreenshotParams
}

export interface BeginFrameResult {
  hasDamage: boolean
  screenshotData?: string
}
