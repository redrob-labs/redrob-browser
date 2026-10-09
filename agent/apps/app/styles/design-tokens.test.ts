/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The panel's colours, type and radii come from @redrob-labs/ui itself and nowhere else.
 *
 * These read the INSTALLED package, not a table of values copied from it. A copied table is how the
 * previous version of this file pinned 1.1.0 while the browser's chrome moved on: both were internally
 * consistent and they disagreed with each other.
 *
 * 1. global.css imports tokens.css, then styles.css, into the `rr` layer, and no longer carries its own
 *    copy of either: no `--rr-*` primitive and no @font-face.
 * 2. Every shadcn role is a single var() naming a custom property the design system declares, so a
 *    renamed token fails here rather than rendering unstyled.
 * 3. The installed package is the version DESIGN_SYSTEM_PIN.json names.
 * 4. Where Tailwind's theme has to repeat a value (font stacks, radii), it repeats it exactly.
 * 5. No upstream orange survives.
 */

import { describe, expect, it } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

const APP = join(import.meta.dir, '..')
const CSS = readFileSync(join(import.meta.dir, 'global.css'), 'utf8')
const PKG = dirname(require.resolve('@redrob-labs/ui/package.json'))
const TOKENS = readFileSync(join(PKG, 'dist/styles/tokens.css'), 'utf8')
const SYSTEM = readFileSync(join(PKG, 'dist/styles/system.css'), 'utf8')
const PIN = JSON.parse(
  readFileSync(join(APP, '../../../DESIGN_SYSTEM_PIN.json'), 'utf8'),
) as { version: string }

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const declared = new Set(
  [...stripComments(TOKENS + SYSTEM).matchAll(/(--[\w-]+)\s*:/g)].map(
    (m) => m[1],
  ),
)

function blocks(selector: string): string[] {
  const out: string[] = []
  const css = stripComments(CSS)
  let at = css.indexOf(`\n${selector} {\n`)
  while (at > -1) {
    const end = css.indexOf('\n}\n', at)
    out.push(css.slice(at, end))
    at = css.indexOf(`\n${selector} {\n`, end)
  }
  return out
}

const declarations = (body: string): Array<[string, string]> =>
  [...body.matchAll(/^\s*--([\w-]+):\s*([^;]+);/gm)].map((m) => [
    m[1],
    m[2].trim(),
  ])

const ROLES = [...blocks(':root'), ...blocks('[data-theme="dark"]')].flatMap(
  declarations,
)

const value = (css: string, name: string) =>
  stripComments(css)
    .match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]
    .replace(/\s+/g, ' ')
    .replace(/["']/g, '')
    .trim()

describe('design tokens', () => {
  it('imports the design system, tokens before system, into the rr layer', () => {
    const tokens = CSS.indexOf(
      '@import "@redrob-labs/ui/tokens.css" layer(rr);',
    )
    const system = CSS.indexOf(
      '@import "@redrob-labs/ui/styles.css" layer(rr);',
    )
    expect(tokens).toBeGreaterThan(-1)
    expect(system).toBeGreaterThan(tokens)
    expect(CSS).toMatch(
      /@layer theme, base, vendor, rr, components, utilities;/,
    )
  })

  it('takes every stylesheet through global.css, so its layer is decided there', () => {
    // A sheet imported from a component lands unlayered and beats every layer, which is how a
    // third-party editor once repainted the system's primitives app-wide.
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (['node_modules', 'dist', '.output', '.wxt'].includes(name)) continue
        const path = join(dir, name)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts')) {
          for (const m of readFileSync(path, 'utf8').matchAll(
            /^import\s+['"]([^'"]+\.css)['"]/gm,
          )) {
            if (!m[1].endsWith('global.css')) offenders.push(`${path}: ${m[1]}`)
          }
        }
      }
    }
    walk(APP)
    expect(offenders).toEqual([])
  })

  it('carries no copy of the system: no primitive, no font face', () => {
    expect(CSS).not.toMatch(/--rr-[\w-]+\s*:/)
    expect(CSS).not.toMatch(/@font-face/)
  })

  it('points every role at a token the design system declares', () => {
    // A broken blocks() would hand back nothing and pass.
    expect(ROLES.length).toBeGreaterThan(40)
    const bad = ROLES.filter(([, v]) => {
      const m = v.match(/^var\((--[\w-]+)\)$/)
      return !m || !declared.has(m[1])
    })
    expect(bad).toEqual([])
  })

  it('is the version the browser pins', () => {
    const installed = JSON.parse(
      readFileSync(join(PKG, 'package.json'), 'utf8'),
    ).version
    expect(installed).toBe(PIN.version)
  })

  it('repeats the font stacks and radii exactly where Tailwind needs its own copy', () => {
    for (const name of ['--font-sans', '--font-mono'])
      expect(value(CSS, name)).toBe(value(TOKENS, name))
    for (const r of ['xs', 'sm', 'md', 'lg', 'xl', '2xl']) {
      expect(value(CSS, `--radius-${r}`)).toBe(value(TOKENS, `--radius-${r}`))
    }
  })

  it('keeps no upstream orange in the stylesheet', () => {
    expect(CSS).not.toMatch(/accent-orange/)
    expect(CSS).not.toMatch(
      /oklch\(0\.[0-9]+ 0\.[0-9]+ (3[0-9]|4[0-9]|5[0-9])\./,
    )
    expect(CSS).not.toMatch(/rgba\(214, 123, 68/)
  })

  it('keeps no upstream orange in the components', () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (['node_modules', 'dist', '.output', '.wxt'].includes(name)) continue
        const path = join(dir, name)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts')) {
          const text = readFileSync(path, 'utf8')
          if (
            /accent-orange|\b(text|bg|border)-(orange|amber)-\d|251, 102, 24|#fb6618/.test(
              text,
            )
          )
            offenders.push(path)
        }
      }
    }
    walk(APP)
    expect(offenders).toEqual([])
  })
})
