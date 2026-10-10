/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: MIT
 *
 * Builds bench/runtime.ts into a compiled binary the way the agent server is built (bundle with
 * `target: 'bun'`, then `bun build --compile`), so the runtimes are measured as they would ship.
 *
 *   bun bench/compile.ts <outdir>
 *
 * A compiled binary cannot resolve `node_modules` on disk, and Bun extracts an embedded `.node`
 * file to a temporary directory without the shared library beside it. So onnxruntime-node's
 * binding is replaced by a loader that opens it from REDROB_ORT_DIR, where the binding and
 * libonnxruntime ship next to each other.
 */

import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const outdir = resolve(process.argv[2] ?? 'dist/bench')
await mkdir(outdir, { recursive: true })

const result = await Bun.build({
  entrypoints: [join(import.meta.dir, 'runtime.ts')],
  outdir: join(outdir, 'bundle'),
  target: 'bun',
  plugins: [
    {
      name: 'ort-binding-from-disk',
      setup(build) {
        // binding.js requires the .node file through a template literal, which the bundler cannot
        // follow, so its source is rewritten to open the binding from disk instead.
        build.onLoad(
          { filter: /onnxruntime-node[\\/]dist[\\/]binding\.js$/ },
          async (args) => {
            const source = await Bun.file(args.path).text()
            const original =
              /require\(`\.\.\/bin\/napi-v6\/\$\{process\.platform\}\/\$\{process\.arch\}\/onnxruntime_binding\.node`\)/
            if (!original.test(source)) {
              throw new Error('onnxruntime-node binding.js changed shape')
            }
            const fromDisk = `(() => {
              const dir = process.env.REDROB_ORT_DIR
              if (!dir) throw new Error('REDROB_ORT_DIR is not set')
              const binding = { exports: {} }
              process.dlopen(binding, require('node:path').join(dir, 'onnxruntime_binding.node'))
              return binding.exports
            })()`
            return {
              loader: 'js',
              contents: source.replace(original, fromDisk),
            }
          },
        )
      },
    },
  ],
})
if (!result.success) {
  console.error(result.logs.map(String).join('\n'))
  process.exit(1)
}

const bundled = result.outputs.find((output) => output.path.endsWith('.js'))
if (!bundled) throw new Error('no bundle was written')
const compile = Bun.spawnSync(
  [
    process.execPath,
    'build',
    '--compile',
    bundled.path,
    '--outfile',
    join(outdir, 'privacy-bench'),
  ],
  { stdout: 'inherit', stderr: 'inherit' },
)
process.exit(compile.exitCode ?? 1)
