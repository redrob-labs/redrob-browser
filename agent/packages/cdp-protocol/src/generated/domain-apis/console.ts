/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

// ── AUTO-GENERATED from CDP protocol. DO NOT EDIT. ──

import type { MessageAddedEvent } from '../domains/console'

export interface ConsoleApi {
  // ── Commands ──

  clearMessages(): Promise<void>
  disable(): Promise<void>
  enable(): Promise<void>

  // ── Events ──

  on(
    event: 'messageAdded',
    handler: (params: MessageAddedEvent) => void,
  ): () => void
}
