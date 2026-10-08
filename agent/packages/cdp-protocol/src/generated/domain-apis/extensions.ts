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
  ClearStorageItemsParams,
  GetExtensionsResult,
  GetStorageItemsParams,
  GetStorageItemsResult,
  LoadUnpackedParams,
  LoadUnpackedResult,
  RemoveStorageItemsParams,
  SetStorageItemsParams,
  TriggerActionParams,
  UninstallParams,
} from '../domains/extensions'

export interface ExtensionsApi {
  // ── Commands ──

  triggerAction(params: TriggerActionParams): Promise<void>
  loadUnpacked(params: LoadUnpackedParams): Promise<LoadUnpackedResult>
  getExtensions(): Promise<GetExtensionsResult>
  uninstall(params: UninstallParams): Promise<void>
  getStorageItems(params: GetStorageItemsParams): Promise<GetStorageItemsResult>
  removeStorageItems(params: RemoveStorageItemsParams): Promise<void>
  clearStorageItems(params: ClearStorageItemsParams): Promise<void>
  setStorageItems(params: SetStorageItemsParams): Promise<void>
}
