/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The panel's colours come from the Redrob design system and nowhere else.
 *
 * 1. Every primitive in global.css equals its value in @redrob-labs/ui 1.1.0
 *    (dist/styles/tokens.css). The table below is that file's values, copied by
 *    name; a primitive that drifts, or one added without a row here, fails.
 * 2. Outside the primitive layer the token blocks hold no colour literal: every
 *    role is a `var(--rr-*)`, except surface-sunken, which the system itself
 *    defines as a literal for dark mode.
 * 3. No upstream orange survives anywhere in the stylesheet or the components.
 */

import { describe, expect, it } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const APP = join(import.meta.dir, '..')
const CSS = readFileSync(join(import.meta.dir, 'global.css'), 'utf8')

// @redrob-labs/ui 1.1.0, dist/styles/tokens.css, by token name.
const SYSTEM: Record<string, string> = {
  'rr-black': '#0a0b0c', // redrob-black
  'rr-white': '#ffffff', // redrob-white
  'rr-blue-1': '#eef4ff',
  'rr-blue-2': '#d9e6ff',
  'rr-blue-3': '#bad2ff',
  'rr-blue-4': '#8aafff',
  'rr-blue-5': '#507fff',
  'rr-blue-6': '#2b52ff',
  'rr-blue-7': '#1733d5',
  'rr-blue-8': '#09209c',
  'rr-blue-9': '#061460',
  'rr-blue-10': '#030c34',
  'rr-gray-1': '#f8f9fb',
  'rr-gray-2': '#eff1f4',
  'rr-gray-3': '#dfe2e8',
  'rr-gray-4': '#cbcfd7',
  'rr-gray-5': '#aab0bb',
  'rr-gray-6': '#7c8390',
  'rr-gray-7': '#576071',
  'rr-gray-8': '#292e37',
  'rr-gray-9': '#141719',
  'rr-teal-3': '#6ff4f0', // accent-teal-3
  'rr-teal-4': '#00b5c2',
  'rr-sky-3': '#2f8dff',
  'rr-sky-4': '#0e51b6',
  'rr-violet-3': '#8944ff',
  'rr-pink-3': '#ff39ba',
  'rr-red-3': '#ff4b4b',
  'rr-red-4': '#a31310',
  'rr-orange-3': '#ff9c1b',
  'rr-orange-4': '#ae5100',
  'rr-lime-4': '#89ad00',
  'rr-green-3': '#29e474',
  'rr-green-4': '#00864a',
}

function block(selector: string): string {
  const start = CSS.indexOf(`\n${selector} {\n`)
  expect(start).toBeGreaterThan(-1)
  const end = CSS.indexOf('\n}\n', start)
  return CSS.slice(start, end)
}

function declarations(body: string): Array<[string, string]> {
  return [...body.matchAll(/^\s*--([\w-]+):\s*([^;]+);/gm)].map((m) => [
    m[1],
    m[2].trim(),
  ])
}

const ROOT_DECLS = declarations(block(':root'))
const DARK_DECLS = declarations(block('.dark'))

describe('design tokens', () => {
  it('declares every primitive at its design-system value', () => {
    const primitives = Object.fromEntries(
      ROOT_DECLS.filter(([name]) => name.startsWith('rr-')),
    )
    expect(primitives).toEqual(SYSTEM)
  })

  it('points every role at a primitive', () => {
    const roles = [...ROOT_DECLS, ...DARK_DECLS].filter(
      ([name]) => !name.startsWith('rr-') && name !== 'radius',
    )
    // A broken block() would hand back nothing and pass.
    expect(roles.length).toBeGreaterThan(60)
    const literals = roles.filter(
      ([name, value]) =>
        !/^var\(--rr-[\w-]+\)$/.test(value) &&
        // surface-sunken, dark: the system's own literal (tokens.css).
        !((name === 'secondary' || name === 'muted') && value === '#1c1f26'),
    )
    expect(literals).toEqual([])
  })

  it('keeps no upstream orange in the stylesheet', () => {
    expect(CSS).not.toMatch(/accent-orange(?!-[34] \*\/)/)
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
  it('takes the type and radius scale from the design system', () => {
    // tokens.css: --font-sans, --font-mono and --radius-xs..2xl.
    expect(CSS).toContain(
      '--font-sans:\n    Pretendard, "Wanted Sans", "Noto Sans Devanagari", system-ui, -apple-system,\n    "Segoe UI", sans-serif;',
    )
    expect(CSS).toContain(
      '--font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;',
    )
    const radii = Object.fromEntries(
      [...CSS.matchAll(/^\s*--radius-(xs|sm|md|lg|xl|2xl):\s*([^;]+);/gm)].map(
        (m) => [m[1], m[2]],
      ),
    )
    expect(radii).toEqual({
      xs: '4px',
      sm: '6px',
      md: '8px',
      lg: '12px',
      xl: '16px',
      '2xl': '24px',
    })
    expect(CSS).not.toMatch(/Geist/)
    // Every face the sheet declares is a file that ships.
    for (const m of CSS.matchAll(/url\("\.\.\/fonts\/([^"]+)"\)/g)) {
      expect(statSync(join(APP, 'public', 'fonts', m[1])).size).toBeGreaterThan(
        0,
      )
    }
  })
})
