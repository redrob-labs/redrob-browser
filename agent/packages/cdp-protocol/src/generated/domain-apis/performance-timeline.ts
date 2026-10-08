/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

// ── AUTO-GENERATED from CDP protocol. DO NOT EDIT. ──

import type {
  EnableParams,
  TimelineEventAddedEvent,
} from '../domains/performance-timeline'

export interface PerformanceTimelineApi {
  // ── Commands ──

  enable(params: EnableParams): Promise<void>

  // ── Events ──

  on(
    event: 'timelineEventAdded',
    handler: (params: TimelineEventAddedEvent) => void,
  ): () => void
}
