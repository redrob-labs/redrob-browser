/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: MIT
 *
 * A candidate for the agent server's native-addon guard that allows named files and nothing else.
 *
 * The shipped guard (apps/server/src/lib/native-addon-guard.ts) refuses every addon, because Bun
 * extracts embedded `.node` files to a temporary directory where anything could have replaced them.
 * This version keeps that refusal for every path except the ones it is given. Each of those is
 * hashed when the guard is installed, and opened only if it still has the same hash. A binding's own
 * shared libraries are loaded by the operating system, not by dlopen, so they are listed and
 * checked here too, before anything is opened.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export type PinnedFile = { path: string; sha256: string }

const hashOf = (path: string) =>
  createHash('sha256').update(readFileSync(path)).digest('hex')

export function installPinnedAddonGuard(
  addons: readonly PinnedFile[],
  libraries: readonly PinnedFile[],
): void {
  for (const file of [...addons, ...libraries]) {
    if (hashOf(file.path) !== file.sha256) {
      throw new Error(`native file does not match its pin: ${file.path}`)
    }
  }
  const allowed = new Map(addons.map((file) => [resolve(file.path), file]))
  const original = process.dlopen.bind(process)
  const guard: NodeJS.Process['dlopen'] = (module, filename, flags) => {
    const pinned = allowed.get(resolve(filename))
    if (!pinned) {
      throw new Error(
        'Redrob server disables native addon loading in compiled production builds',
      )
    }
    // Hashed again at the moment of use, so a file replaced after start-up is refused too.
    if (hashOf(pinned.path) !== pinned.sha256) {
      throw new Error(`native addon changed since start-up: ${pinned.path}`)
    }
    for (const library of libraries) {
      if (hashOf(library.path) !== library.sha256) {
        throw new Error(
          `native library changed since start-up: ${library.path}`,
        )
      }
    }
    return original(module, filename, flags)
  }
  process.dlopen = guard
}
