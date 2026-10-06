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
  ChangeAppUserSettingsParams,
  GetOsAppStateParams,
  GetOsAppStateResult,
  InstallParams,
  LaunchFilesInAppParams,
  LaunchFilesInAppResult,
  LaunchParams,
  LaunchResult,
  OpenCurrentPageInAppParams,
  UninstallParams,
} from '../domains/pwa'

export interface PWAApi {
  // ── Commands ──

  getOsAppState(params: GetOsAppStateParams): Promise<GetOsAppStateResult>
  install(params: InstallParams): Promise<void>
  uninstall(params: UninstallParams): Promise<void>
  launch(params: LaunchParams): Promise<LaunchResult>
  launchFilesInApp(
    params: LaunchFilesInAppParams,
  ): Promise<LaunchFilesInAppResult>
  openCurrentPageInApp(params: OpenCurrentPageInAppParams): Promise<void>
  changeAppUserSettings(params: ChangeAppUserSettingsParams): Promise<void>
}
