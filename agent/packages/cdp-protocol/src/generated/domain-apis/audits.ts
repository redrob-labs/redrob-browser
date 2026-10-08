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
  CheckFormsIssuesResult,
  GetEncodedResponseParams,
  GetEncodedResponseResult,
  IssueAddedEvent,
} from '../domains/audits'

export interface AuditsApi {
  // ── Commands ──

  getEncodedResponse(
    params: GetEncodedResponseParams,
  ): Promise<GetEncodedResponseResult>
  disable(): Promise<void>
  enable(): Promise<void>
  checkFormsIssues(): Promise<CheckFormsIssuesResult>

  // ── Events ──

  on(
    event: 'issueAdded',
    handler: (params: IssueAddedEvent) => void,
  ): () => void
}
