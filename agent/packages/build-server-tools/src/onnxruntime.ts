/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Bundles onnxruntime-node into the compiled server so it can open the runtime shipped beside it.
 *
 * Two problems, both found in packages/privacy/bench (RESULTS.md):
 *   - binding.js requires its `.node` file through a template literal the bundler cannot follow,
 *     and an embedded `.node` is extracted without the shared library it needs. So binding.js is
 *     rewritten to open the binding from REDROB_ORT_DIR, which the server sets to
 *     `resources/bin/third_party/onnxruntime` (server-prod-resources.json stages it there).
 *   - the native-addon guard must know what it may open. So the server's `lib/ort-pins.ts` is
 *     replaced with the SHA-256 of every runtime file for every platform, computed here.
 */

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { BunPlugin } from 'bun'

const BINDING_REQUIRE =
  /require\(`\.\.\/bin\/napi-v6\/\$\{process\.platform\}\/\$\{process\.arch\}\/onnxruntime_binding\.node`\)/

const BINDING_FROM_DISK = `(() => {
  const dir = process.env.REDROB_ORT_DIR
  if (!dir) throw new Error('REDROB_ORT_DIR is not set: the privacy model runtime is not installed')
  const binding = { exports: {} }
  process.dlopen(binding, require('node:path').join(dir, 'onnxruntime_binding.node'))
  return binding.exports
})()`

/** Where onnxruntime-node keeps its per-platform files, from the package itself. */
export function onnxruntimeBinDir(fromDir = process.cwd()): string {
  const require = createRequire(join(fromDir, 'package.json'))
  return join(
    dirname(require.resolve('onnxruntime-node/package.json')),
    'bin',
    'napi-v6',
  )
}

/** `{ 'linux-x64': { 'onnxruntime_binding.node': '…', 'libonnxruntime.so.1': '…' }, … }` */
export function onnxruntimePins(
  binDir: string,
): Record<string, Record<string, string>> {
  const pins: Record<string, Record<string, string>> = {}
  for (const platform of readdirSync(binDir)) {
    for (const arch of readdirSync(join(binDir, platform))) {
      const dir = join(binDir, platform, arch)
      pins[`${platform}-${arch}`] = Object.fromEntries(
        readdirSync(dir)
          .sort()
          .map((file) => [
            file,
            createHash('sha256')
              .update(readFileSync(join(dir, file)))
              .digest('hex'),
          ]),
      )
    }
  }
  return pins
}

export function rewriteBindingSource(source: string): string {
  if (!BINDING_REQUIRE.test(source)) {
    throw new Error(
      'onnxruntime-node binding.js changed shape; update packages/build-server-tools/src/onnxruntime.ts',
    )
  }
  return source.replace(BINDING_REQUIRE, BINDING_FROM_DISK)
}

export function onnxruntimePlugin(): BunPlugin {
  return {
    name: 'onnxruntime-node',
    setup(build) {
      build.onLoad(
        { filter: /onnxruntime-node[\\/]dist[\\/]binding\.js$/ },
        async (args) => ({
          loader: 'js',
          contents: rewriteBindingSource(await Bun.file(args.path).text()),
        }),
      )
      build.onLoad({ filter: /[\\/]lib[\\/]ort-pins\.ts$/ }, () => ({
        loader: 'ts',
        contents: `export const ORT_PINS = ${JSON.stringify(onnxruntimePins(onnxruntimeBinDir()))}\n`,
      }))
    },
  }
}
