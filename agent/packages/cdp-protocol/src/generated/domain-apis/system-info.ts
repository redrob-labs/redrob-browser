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
  GetFeatureStateParams,
  GetFeatureStateResult,
  GetInfoResult,
  GetProcessInfoResult,
} from '../domains/system-info'

export interface SystemInfoApi {
  // ── Commands ──

  getInfo(): Promise<GetInfoResult>
  getFeatureState(params: GetFeatureStateParams): Promise<GetFeatureStateResult>
  getProcessInfo(): Promise<GetProcessInfoResult>
}
