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
  CloseParams,
  ReadParams,
  ReadResult,
  ResolveBlobParams,
  ResolveBlobResult,
} from '../domains/io'

export interface IOApi {
  // ── Commands ──

  close(params: CloseParams): Promise<void>
  read(params: ReadParams): Promise<ReadResult>
  resolveBlob(params: ResolveBlobParams): Promise<ResolveBlobResult>
}
