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
  AddressFormFilledEvent,
  SetAddressesParams,
  TriggerParams,
} from '../domains/autofill'

export interface AutofillApi {
  // ── Commands ──

  trigger(params: TriggerParams): Promise<void>
  setAddresses(params: SetAddressesParams): Promise<void>
  disable(): Promise<void>
  enable(): Promise<void>

  // ── Events ──

  on(
    event: 'addressFormFilled',
    handler: (params: AddressFormFilledEvent) => void,
  ): () => void
}
