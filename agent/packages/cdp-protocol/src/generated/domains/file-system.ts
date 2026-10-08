/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

// ── AUTO-GENERATED from CDP protocol. DO NOT EDIT. ──

import type { TimeSinceEpoch } from './network'
import type { SerializedStorageKey } from './storage'

// ══ Types ══

export interface File {
  name: string
  lastModified: TimeSinceEpoch
  size: number
  type: string
}

export interface Directory {
  name: string
  nestedDirectories: string[]
  nestedFiles: File[]
}

export interface BucketFileSystemLocator {
  storageKey: SerializedStorageKey
  bucketName?: string
  pathComponents: string[]
}

// ══ Commands ══

export interface GetDirectoryParams {
  bucketFileSystemLocator: BucketFileSystemLocator
}

export interface GetDirectoryResult {
  directory: Directory
}
