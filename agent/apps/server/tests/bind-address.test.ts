/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it } from 'bun:test'
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'

// The agent server drives the user's browser: tabs, page content, logged-in sessions. It must answer
// only on this machine. Upstream bound 0.0.0.0, which let any device on the same network reach it.
const SOURCES = ['src/main.ts', 'src/api/server.ts']

describe('agent server bind address', () => {
  for (const relative of SOURCES) {
    it(`${relative} never binds every interface`, () => {
      const text = fs.readFileSync(
        path.join(import.meta.dir, '..', relative),
        'utf8',
      )
      assert.ok(
        !text.includes("'0.0.0.0'"),
        `${relative} binds 0.0.0.0; use 127.0.0.1`,
      )
      assert.ok(
        text.includes("'127.0.0.1'"),
        `${relative} no longer names the loopback bind`,
      )
    })
  }
})
