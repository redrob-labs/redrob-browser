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

export type RequestId = string

export type DeviceId = string

export interface PromptDevice {
  id: DeviceId
  name: string
}

// ══ Commands ══

export interface SelectPromptParams {
  id: RequestId
  deviceId: DeviceId
}

export interface CancelPromptParams {
  id: RequestId
}

// ══ Events ══

export interface DeviceRequestPromptedEvent {
  id: RequestId
  devices: PromptDevice[]
}
