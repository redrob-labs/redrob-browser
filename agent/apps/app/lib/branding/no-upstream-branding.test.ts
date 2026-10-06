/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The panel must not name the upstream product or send people to its sites.
 *
 * This scans the source line by line, which is deliberately coarse. A line is
 * allowed to mention the name only when it is a comment line (licence headers
 * and provenance notes, which the licence requires) or when every mention is
 * part of a longer identifier (`getBrowserOSAdapter`, the `browserOS` API).
 * Anything else, a string literal or JSX text, fails. A trailing comment on a
 * code line fails too: that is a false positive, and the fix is to move the
 * comment up a line, never to widen this check.
 */

import { describe, expect, it } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dir, '..', '..')
const SKIP_DIRS = new Set(['node_modules', 'dist', '.output', '.wxt'])
const EXTENSIONS = /\.(ts|tsx|html)$/

// Lines that name an upstream host for a functional reason, with that reason.
const ALLOWED: Record<string, string> = {
  // The upstream account site's origin, kept so its pages can still reach
  // app.html (web_accessible_resources). Never shown, never linked.
  'lib/constants/productWebHost.ts':
    "export const PRODUCT_WEB_HOST = 'browseros.com'",
  // No version is listed in CHANGELOG_VERSIONS, so this is never opened.
  'lib/changelog/changelog-config.ts':
    "const CHANGELOG_BASE_URL = 'https://docs.browseros.com/changelog'",
  // Developer tooling: where web-ext looks for an installed binary on macOS.
  'web-ext.config.ts':
    "'/Applications/BrowserOS.app/Contents/MacOS/BrowserOS',",
}

const NAME = /BrowserOS/g
const HOSTS =
  /browseros\.com|git\.new\/browseros|dub\.sh\/browseros|discord\.gg\/browseros|github\.com\/browseros-ai/i
const IDENT = /[A-Za-z0-9_$]/

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path))
    else if (EXTENSIONS.test(name) && !/\.test\.tsx?$/.test(name))
      out.push(path)
  }
  return out
}

function isCommentLine(line: string): boolean {
  const t = line.trim()
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')
}

export function offendingLines(file: string, text: string): string[] {
  const allowed = ALLOWED[file]
  const bad: string[] = []
  text.split('\n').forEach((line, i) => {
    if (isCommentLine(line)) return
    if (allowed && line.trim() === allowed) return
    const bareName = [...line.matchAll(NAME)].some((m) => {
      const before = line[m.index - 1] ?? ''
      const after = line[m.index + m[0].length] ?? ''
      return !IDENT.test(before) && !IDENT.test(after)
    })
    if (bareName || HOSTS.test(line))
      bad.push(`${file}:${i + 1}: ${line.trim()}`)
  })
  return bad
}

describe('upstream branding in the panel', () => {
  const files = sourceFiles(ROOT)

  it('scans the panel source', () => {
    // A wrong ROOT would scan nothing and pass. The app has hundreds of files.
    expect(files.length).toBeGreaterThan(300)
  })

  it('names no upstream product or site outside comments and identifiers', () => {
    const bad = files.flatMap((path) =>
      offendingLines(relative(ROOT, path), readFileSync(path, 'utf8')),
    )
    expect(bad).toEqual([])
  })

  it('catches the shapes it exists for', () => {
    // Each was a real line in this app before the sweep.
    expect(
      offendingLines('x.tsx', "  label: 'BrowserOS agent + your LLM',"),
    ).toHaveLength(1)
    expect(offendingLines('x.tsx', '        About BrowserOS')).toHaveLength(1)
    expect(
      offendingLines(
        'x.tsx',
        "  { name: 'Docs', href: 'https://docs.browseros.com/' },",
      ),
    ).toHaveLength(1)
    expect(
      offendingLines('x.tsx', "'Go to http://git.new/browseros and star it'"),
    ).toHaveLength(1)
    // And lets these through.
    expect(
      offendingLines('x.tsx', 'const adapter = getBrowserOSAdapter()'),
    ).toEqual([])
    expect(offendingLines('x.tsx', ' * Copyright 2025 BrowserOS')).toEqual([])
    expect(
      offendingLines(
        'x.tsx',
        ' * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).',
      ),
    ).toEqual([])
  })
})
