/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

// ── AUTO-GENERATED from CDP protocol. DO NOT EDIT. ──

import type { RemoteObjectId } from './runtime'

// ══ Types ══

export type StreamHandle = string

// ══ Commands ══

export interface CloseParams {
  handle: StreamHandle
}

export interface ReadParams {
  handle: StreamHandle
  offset?: number
  size?: number
}

export interface ReadResult {
  base64Encoded?: boolean
  data: string
  eof: boolean
}

export interface ResolveBlobParams {
  objectId: RemoteObjectId
}

export interface ResolveBlobResult {
  uuid: string
}
