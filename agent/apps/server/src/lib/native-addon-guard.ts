/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 *
 * Redrob: the guard allows pinned files and nothing else. Every other native addon is refused, as
 * before, because Bun extracts embedded `.node` files to a temporary directory where anything could
 * have replaced them. The one exception is the privacy model's runtime, onnxruntime-node, shipped
 * beside the server (measured in packages/privacy/bench/RESULTS.md). Its files are hashed when the
 * server is bundled (lib/ort-pins.ts, filled in by the build), and at the moment of `dlopen` the
 * binding and every library beside it must still have those hashes. The libraries are loaded by
 * the operating system rather than by dlopen, which is why they are checked here too.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { ORT_PINS } from './ort-pins'

const NATIVE_ADDON_DISABLED_MESSAGE =
  'Redrob server disables native addon loading in compiled production builds'

interface GuardedProcess extends NodeJS.Process {
  __browserosNativeAddonGuardInstalled?: boolean
}

/** File name to SHA-256, for one platform's runtime directory. */
export type NativePins = Readonly<Record<string, string>>

const hashOf = (path: string) =>
  createHash('sha256').update(readFileSync(path)).digest('hex')

/** Whether `filename` is a pinned addon whose directory still matches every pin. */
export function isPinnedAddon(filename: string, pins: NativePins): boolean {
  const name = basename(filename)
  if (!name.endsWith('.node') || !pins[name]) return false
  const dir = dirname(filename)
  try {
    return Object.entries(pins).every(
      ([file, sha256]) => hashOf(join(dir, file)) === sha256,
    )
  } catch {
    return false
  }
}

/** Blocks native addons before Bun can extract bundled `.node` files; allows pinned ones. */
export function installNativeAddonGuard(
  pins: NativePins = ORT_PINS[`${process.platform}-${process.arch}`] ?? {},
): void {
  const guardedProcess = process as GuardedProcess
  if (guardedProcess.__browserosNativeAddonGuardInstalled) return

  const original = process.dlopen.bind(process)
  const guard: NodeJS.Process['dlopen'] = (module, filename, flags) => {
    if (!isPinnedAddon(filename, pins)) {
      throw new Error(NATIVE_ADDON_DISABLED_MESSAGE)
    }
    return original(module, filename, flags)
  }

  process.dlopen = guard
  guardedProcess.__browserosNativeAddonGuardInstalled = true
}
