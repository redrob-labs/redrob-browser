/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Onboarding must not name the upstream product or send people to its sites.
 *
 * The same line-based check as apps/app/lib/branding/no-upstream-branding.test.ts:
 * a mention is allowed only on a comment line or inside a longer identifier.
 */

import { describe, expect, it } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// The onboarding app's own tree: src/ and index.html.
const ROOT = join(import.meta.dir, '..', '..')
const SCAN = ['src', 'index.html']
const NAME = /BrowserOS|BrowserClaw/g
const HOSTS =
  /browseros\.com|git\.new\/browseros|dub\.sh\/browseros|discord\.gg\/browseros|github\.com\/browseros-ai/i
const IDENT = /[A-Za-z0-9_$]/

function sourceFiles(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path]
  return readdirSync(path).flatMap((name) => {
    const child = join(path, name)
    if (statSync(child).isDirectory()) return sourceFiles(child)
    return /\.(ts|tsx|html)$/.test(name) && !/\.test\.tsx?$/.test(name)
      ? [child]
      : []
  })
}

function isCommentLine(line: string): boolean {
  const t = line.trim()
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')
}

function offendingLines(file: string, text: string): string[] {
  const bad: string[] = []
  text.split('\n').forEach((line, i) => {
    if (isCommentLine(line)) return
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

describe('upstream branding in onboarding', () => {
  const files = SCAN.flatMap((p) => sourceFiles(join(ROOT, p)))

  it('scans the onboarding source', () => {
    // A wrong ROOT would scan nothing and pass.
    expect(files.length).toBeGreaterThan(20)
  })

  it('names no upstream product or site outside comments and identifiers', () => {
    const bad = files.flatMap((path) =>
      offendingLines(relative(ROOT, path), readFileSync(path, 'utf8')),
    )
    expect(bad).toEqual([])
  })

  it('catches the shapes it exists for', () => {
    expect(
      offendingLines('x.tsx', 'Welcome to <Em>BrowserOS</Em>'),
    ).toHaveLength(1)
    expect(
      offendingLines('x.html', '<title>BrowserOS Onboarding</title>'),
    ).toHaveLength(1)
    expect(
      offendingLines(
        'x.ts',
        'import { browserOSApi } from "./BrowserOSBridge"',
      ),
    ).toEqual([])
    expect(offendingLines('x.ts', ' * Copyright 2025 BrowserOS')).toEqual([])
  })
})
