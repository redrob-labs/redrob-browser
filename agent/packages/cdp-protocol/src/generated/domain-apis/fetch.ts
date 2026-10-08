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
  AuthRequiredEvent,
  ContinueRequestParams,
  ContinueResponseParams,
  ContinueWithAuthParams,
  EnableParams,
  FailRequestParams,
  FulfillRequestParams,
  GetResponseBodyParams,
  GetResponseBodyResult,
  RequestPausedEvent,
  TakeResponseBodyAsStreamParams,
  TakeResponseBodyAsStreamResult,
} from '../domains/fetch'

export interface FetchApi {
  // ── Commands ──

  disable(): Promise<void>
  enable(params?: EnableParams): Promise<void>
  failRequest(params: FailRequestParams): Promise<void>
  fulfillRequest(params: FulfillRequestParams): Promise<void>
  continueRequest(params: ContinueRequestParams): Promise<void>
  continueWithAuth(params: ContinueWithAuthParams): Promise<void>
  continueResponse(params: ContinueResponseParams): Promise<void>
  getResponseBody(params: GetResponseBodyParams): Promise<GetResponseBodyResult>
  takeResponseBodyAsStream(
    params: TakeResponseBodyAsStreamParams,
  ): Promise<TakeResponseBodyAsStreamResult>

  // ── Events ──

  on(
    event: 'requestPaused',
    handler: (params: RequestPausedEvent) => void,
  ): () => void
  on(
    event: 'authRequired',
    handler: (params: AuthRequiredEvent) => void,
  ): () => void
}
