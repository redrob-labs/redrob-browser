/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

export { CdpBackend } from './backends/cdp'
export type {
  CdpBackend as CdpBackendConnection,
  CdpTarget,
} from './backends/types'
export { Browser } from './browser'
export type { BrowserSessionHooks } from './core/session'
export { BrowserSession } from './core/session'
export type { TabGroup } from './tab-groups'
