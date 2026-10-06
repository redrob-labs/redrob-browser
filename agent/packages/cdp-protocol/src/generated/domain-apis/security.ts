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
  CertificateErrorEvent,
  HandleCertificateErrorParams,
  SecurityStateChangedEvent,
  SetIgnoreCertificateErrorsParams,
  SetOverrideCertificateErrorsParams,
  VisibleSecurityStateChangedEvent,
} from '../domains/security'

export interface SecurityApi {
  // ── Commands ──

  disable(): Promise<void>
  enable(): Promise<void>
  setIgnoreCertificateErrors(
    params: SetIgnoreCertificateErrorsParams,
  ): Promise<void>
  handleCertificateError(params: HandleCertificateErrorParams): Promise<void>
  setOverrideCertificateErrors(
    params: SetOverrideCertificateErrorsParams,
  ): Promise<void>

  // ── Events ──

  on(
    event: 'certificateError',
    handler: (params: CertificateErrorEvent) => void,
  ): () => void
  on(
    event: 'visibleSecurityStateChanged',
    handler: (params: VisibleSecurityStateChangedEvent) => void,
  ): () => void
  on(
    event: 'securityStateChanged',
    handler: (params: SecurityStateChangedEvent) => void,
  ): () => void
}
