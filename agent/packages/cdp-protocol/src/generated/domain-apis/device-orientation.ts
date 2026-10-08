/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

// ── AUTO-GENERATED from CDP protocol. DO NOT EDIT. ──

import type { SetDeviceOrientationOverrideParams } from '../domains/device-orientation'

export interface DeviceOrientationApi {
  // ── Commands ──

  clearDeviceOrientationOverride(): Promise<void>
  setDeviceOrientationOverride(
    params: SetDeviceOrientationOverrideParams,
  ): Promise<void>
}
