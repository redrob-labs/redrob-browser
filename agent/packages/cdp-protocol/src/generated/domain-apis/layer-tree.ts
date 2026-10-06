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
  CompositingReasonsParams,
  CompositingReasonsResult,
  LayerPaintedEvent,
  LayerTreeDidChangeEvent,
  LoadSnapshotParams,
  LoadSnapshotResult,
  MakeSnapshotParams,
  MakeSnapshotResult,
  ProfileSnapshotParams,
  ProfileSnapshotResult,
  ReleaseSnapshotParams,
  ReplaySnapshotParams,
  ReplaySnapshotResult,
  SnapshotCommandLogParams,
  SnapshotCommandLogResult,
} from '../domains/layer-tree'

export interface LayerTreeApi {
  // ── Commands ──

  compositingReasons(
    params: CompositingReasonsParams,
  ): Promise<CompositingReasonsResult>
  disable(): Promise<void>
  enable(): Promise<void>
  loadSnapshot(params: LoadSnapshotParams): Promise<LoadSnapshotResult>
  makeSnapshot(params: MakeSnapshotParams): Promise<MakeSnapshotResult>
  profileSnapshot(params: ProfileSnapshotParams): Promise<ProfileSnapshotResult>
  releaseSnapshot(params: ReleaseSnapshotParams): Promise<void>
  replaySnapshot(params: ReplaySnapshotParams): Promise<ReplaySnapshotResult>
  snapshotCommandLog(
    params: SnapshotCommandLogParams,
  ): Promise<SnapshotCommandLogResult>

  // ── Events ──

  on(
    event: 'layerPainted',
    handler: (params: LayerPaintedEvent) => void,
  ): () => void
  on(
    event: 'layerTreeDidChange',
    handler: (params: LayerTreeDidChangeEvent) => void,
  ): () => void
}
