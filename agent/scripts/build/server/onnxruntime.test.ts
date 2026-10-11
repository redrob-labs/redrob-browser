/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  onnxruntimeBinDir,
  onnxruntimePins,
  rewriteBindingSource,
} from '../../../packages/build-server-tools/src/onnxruntime'

describe('bundling onnxruntime-node', () => {
  it('pins every platform the package ships, and rewrites the binding to open from disk', () => {
    const binDir = onnxruntimeBinDir(join(import.meta.dir, '../../..'))
    const pins = onnxruntimePins(binDir)
    for (const target of ['linux-x64', 'darwin-arm64', 'win32-x64']) {
      expect(Object.keys(pins[target] ?? {})).toContain(
        'onnxruntime_binding.node',
      )
    }
    expect(Object.keys(pins['linux-x64'] ?? {})).toContain(
      'libonnxruntime.so.1',
    )
    const binding = readFileSync(
      join(binDir, '..', '..', 'dist', 'binding.js'),
      'utf8',
    )
    const rewritten = rewriteBindingSource(binding)
    expect(rewritten).toContain('process.env.REDROB_ORT_DIR')
    expect(rewritten).not.toContain('../bin/napi-v6/')
    expect(() => rewriteBindingSource('module.exports = {}')).toThrow(
      'changed shape',
    )
  })
})
