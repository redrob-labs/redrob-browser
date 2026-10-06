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
  RemoveInstrumentationBreakpointParams,
  SetInstrumentationBreakpointParams,
} from '../domains/event-breakpoints'

export interface EventBreakpointsApi {
  // ── Commands ──

  setInstrumentationBreakpoint(
    params: SetInstrumentationBreakpointParams,
  ): Promise<void>
  removeInstrumentationBreakpoint(
    params: RemoveInstrumentationBreakpointParams,
  ): Promise<void>
  disable(): Promise<void>
}
