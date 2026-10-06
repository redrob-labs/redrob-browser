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
  CancelPromptParams,
  DeviceRequestPromptedEvent,
  SelectPromptParams,
} from '../domains/device-access'

export interface DeviceAccessApi {
  // ── Commands ──

  enable(): Promise<void>
  disable(): Promise<void>
  selectPrompt(params: SelectPromptParams): Promise<void>
  cancelPrompt(params: CancelPromptParams): Promise<void>

  // ── Events ──

  on(
    event: 'deviceRequestPrompted',
    handler: (params: DeviceRequestPromptedEvent) => void,
  ): () => void
}
