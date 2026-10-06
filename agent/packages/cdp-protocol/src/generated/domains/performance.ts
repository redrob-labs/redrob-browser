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

export interface Metric {
  name: string
  value: number
}

// ══ Commands ══

export interface EnableParams {
  timeDomain?: 'timeTicks' | 'threadTicks'
}

export interface SetTimeDomainParams {
  timeDomain: 'timeTicks' | 'threadTicks'
}

export interface GetMetricsResult {
  metrics: Metric[]
}

// ══ Events ══

export interface MetricsEvent {
  metrics: Metric[]
  title: string
}
