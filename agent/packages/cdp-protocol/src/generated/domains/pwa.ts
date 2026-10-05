/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

// ── AUTO-GENERATED from CDP protocol. DO NOT EDIT. ──

import type { TargetID } from './target'

// ══ Types ══

export interface FileHandlerAccept {
  mediaType: string
  fileExtensions: string[]
}

export interface FileHandler {
  action: string
  accepts: FileHandlerAccept[]
  displayName: string
}

export type DisplayMode = 'standalone' | 'browser'

// ══ Commands ══

export interface GetOsAppStateParams {
  manifestId: string
}

export interface GetOsAppStateResult {
  badgeCount: number
  fileHandlers: FileHandler[]
}

export interface InstallParams {
  manifestId: string
  installUrlOrBundleUrl?: string
}

export interface UninstallParams {
  manifestId: string
}

export interface LaunchParams {
  manifestId: string
  url?: string
}

export interface LaunchResult {
  targetId: TargetID
}

export interface LaunchFilesInAppParams {
  manifestId: string
  files: string[]
}

export interface LaunchFilesInAppResult {
  targetIds: TargetID[]
}

export interface OpenCurrentPageInAppParams {
  manifestId: string
}

export interface ChangeAppUserSettingsParams {
  manifestId: string
  linkCapturing?: boolean
  displayMode?: DisplayMode
}
