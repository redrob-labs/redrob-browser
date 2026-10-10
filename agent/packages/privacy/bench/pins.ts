/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: MIT
 *
 * Writes the pins for a staged runtime directory: `bun bench/pins.ts <dir> > pins.json`.
 */

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2]
if (!dir) {
  console.error('usage: pins.ts <dir>')
  process.exit(2)
}
const pins = Object.fromEntries(
  readdirSync(dir)
    .sort()
    .map((name) => [
      name,
      createHash('sha256')
        .update(readFileSync(join(dir, name)))
        .digest('hex'),
    ]),
)
console.log(JSON.stringify(pins, null, 2))
