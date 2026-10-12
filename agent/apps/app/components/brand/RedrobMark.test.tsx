/**
 * @license
 * Copyright 2026 Redrob and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The brand artwork is the delivery's, byte for byte, and both grounds ship.
 *
 * Nothing in a build reads a PNG's pixels, so a re-exported, recoloured or flattened mark passes every
 * other check. The sha256 here is DESIGN_SYSTEM_PIN.json's, read from the pin itself so the two cannot
 * disagree.
 */

import { describe, expect, it } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { RedrobMark } from './RedrobMark'

const APP = join(import.meta.dir, '..', '..')
const ROOT = join(APP, '..', '..', '..')
const PIN = JSON.parse(
  readFileSync(join(ROOT, 'DESIGN_SYSTEM_PIN.json'), 'utf8'),
) as {
  brand_assets: { files: Record<string, { sha256: string; ground: string }> }
}

describe('RedrobMark', () => {
  it('ships each pinned artwork file byte-identical to the pin', () => {
    const files = Object.entries(PIN.brand_assets.files)
    expect(files.map(([, f]) => f.ground).sort()).toEqual(['dark', 'light'])
    for (const [path, { sha256 }] of files) {
      const name = path.split('/').pop() as string
      const bytes = readFileSync(join(APP, 'assets', 'brand', name))
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha256)
    }
  })

  it('renders both grounds and hides the dark one from assistive tech', () => {
    const html = renderToStaticMarkup(<RedrobMark alt="Redrob Code" />)
    expect(html).toContain('ui-mark__light')
    expect(html).toContain('ui-mark__dark')
    expect(html.match(/alt="Redrob Code"/g)?.length).toBe(1)
    expect(html).toContain('aria-hidden')
  })

  it('never recolours the mark', () => {
    const css = readFileSync(join(APP, 'styles', 'global.css'), 'utf8')
    const rules = [...css.matchAll(/[^{}]*\.ui-mark[^{}]*\{([^}]*)\}/g)].map(
      (m) => m[1],
    )
    expect(rules.length).toBeGreaterThan(0)
    for (const body of rules)
      expect(body).not.toMatch(
        /\b(filter|mask|opacity|background|box-shadow|color)\s*:/,
      )
  })
})
