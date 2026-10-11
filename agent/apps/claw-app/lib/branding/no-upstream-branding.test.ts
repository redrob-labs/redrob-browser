/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The claw extension must not name the upstream product or send people to its sites.
 *
 * The same line-based check as apps/app-onboard/src/branding/no-upstream-branding.test.ts:
 * a mention is allowed only on a comment line or inside a longer identifier.
 */

import { describe, expect, it } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// the claw extension's own tree.
const ROOT = join(import.meta.dir, '..', '..')
const SCAN = [
  'components',
  'entrypoints',
  'lib',
  'modules',
  'screens',
  'public',
]
const NAME = /BrowserOS|BrowserClaw/g
const HOSTS =
  /browseros\.com|git\.new\/browseros|dub\.sh\/browseros|discord\.gg\/browseros|github\.com\/browseros-ai/i
const IDENT = /[A-Za-z0-9_$]/

/**
 * Lines that name the upstream because what they describe IS upstream, kept until there is a Redrob
 * build of it. Each is a file and a substring, so a new mention anywhere else still fails.
 *
 * - The Claude Desktop walkthrough downloads browseros-neo-*.mcpb from the upstream's GitHub releases.
 *   Claude shows that bundle by its own name, so the steps must too; renaming the prose would describe a
 *   sheet the user never sees. Replace with a Redrob-built bundle, then delete these.
 * - The onboarding recording is the upstream's video on its CDN.
 */
const UPSTREAM_ARTEFACTS: [file: string, text: string][] = [
  ['screens/mcp/install-guide.data.ts', 'browserclaw-claude-desktop/releases'],
  ['screens/mcp/install-guide.data.ts', 'BrowserOS neo with Claude Cowork'],
  ['screens/mcp/install-guide.data.ts', 'Download the BrowserOS neo extension'],
  [
    'screens/mcp/install-guide.data.ts',
    'Claude shows the BrowserOS neo extension',
  ],
  [
    'screens/mcp/install-guide.data.ts',
    "Claude Desktop's BrowserOS neo extension",
  ],
  ['screens/mcp/install-guide.data.ts', 'docs.browseros.com/neo/mcp/manual'],
  ['screens/mcp/InstallExtensionDialog.tsx', 'Install BrowserOS neo'],
  [
    'components/cockpit/cockpit-videos.ts',
    'cdn.browseros.com/artifacts/claw/onboarding-recording',
  ],
]

function sourceFiles(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path]
  return readdirSync(path).flatMap((name) => {
    const child = join(path, name)
    if (statSync(child).isDirectory()) return sourceFiles(child)
    return /\.(ts|tsx|html|json)$/.test(name) && !/\.test\.tsx?$/.test(name)
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
    if (UPSTREAM_ARTEFACTS.some(([f, t]) => f === file && line.includes(t)))
      return
    if (bareName || HOSTS.test(line))
      bad.push(`${file}:${i + 1}: ${line.trim()}`)
  })
  return bad
}

describe('upstream branding in the claw extension', () => {
  const files = SCAN.flatMap((p) => sourceFiles(join(ROOT, p)))

  it('scans the source', () => {
    // A wrong ROOT would scan nothing and pass.
    expect(files.length).toBeGreaterThan(100)
  })

  it('names no upstream product or site outside comments and identifiers', () => {
    const bad = files.flatMap((path) =>
      offendingLines(relative(ROOT, path), readFileSync(path, 'utf8')),
    )
    expect(bad).toEqual([])
  })

  it('keeps every listed upstream artefact in use, so the list cannot rot', () => {
    for (const [file, text] of UPSTREAM_ARTEFACTS)
      expect(readFileSync(join(ROOT, file), 'utf8')).toContain(text)
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
