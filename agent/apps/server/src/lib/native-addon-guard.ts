/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

const NATIVE_ADDON_DISABLED_MESSAGE =
  'Redrob server disables native addon loading in compiled production builds'

interface GuardedProcess extends NodeJS.Process {
  __browserosNativeAddonGuardInstalled?: boolean
}

/** Blocks native addons before Bun can extract bundled `.node` files. */
export function installNativeAddonGuard(): void {
  const guardedProcess = process as GuardedProcess
  if (guardedProcess.__browserosNativeAddonGuardInstalled) return

  const guard: NodeJS.Process['dlopen'] = () => {
    throw new Error(NATIVE_ADDON_DISABLED_MESSAGE)
  }

  process.dlopen = guard
  guardedProcess.__browserosNativeAddonGuardInstalled = true
}
