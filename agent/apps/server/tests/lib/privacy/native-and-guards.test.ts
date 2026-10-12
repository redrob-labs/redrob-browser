/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterEach, describe, expect, it } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BrowserToolCall } from '../../../src/api/services/mcp/browser-tool-dispatch'
import { guardNeverReadSitesCall } from '../../../src/api/services/mcp/guards/never-read-sites'
import { isPinnedAddon } from '../../../src/lib/native-addon-guard'

const dirs: string[] = []
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() ?? '', { recursive: true, force: true })
})

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

describe('the pinned native-addon guard', () => {
  it('opens a pinned binding only while it and every library beside it match', () => {
    const dir = mkdtempSync(join(tmpdir(), 'redrob-ort-'))
    dirs.push(dir)
    writeFileSync(join(dir, 'onnxruntime_binding.node'), 'binding')
    writeFileSync(join(dir, 'libonnxruntime.so.1'), 'library')
    const pins = {
      'onnxruntime_binding.node': sha256('binding'),
      'libonnxruntime.so.1': sha256('library'),
    }
    const binding = join(dir, 'onnxruntime_binding.node')
    expect(isPinnedAddon(binding, pins)).toBe(true)
    // Anything not pinned stays refused, as the shipped guard always refused it.
    expect(isPinnedAddon(join(dir, 'other.node'), pins)).toBe(false)
    expect(isPinnedAddon(binding, {})).toBe(false)
    // A library changed after the build is enough to refuse the binding.
    writeFileSync(join(dir, 'libonnxruntime.so.1'), 'library!')
    expect(isPinnedAddon(binding, pins)).toBe(false)
  })
})

function call(
  tool: string,
  args: Record<string, unknown>,
  pages: Record<number, string>,
): BrowserToolCall {
  const infos = Object.entries(pages).map(([id, url]) => ({
    pageId: Number(id),
    url,
  }))
  return {
    tool: { name: tool },
    args,
    context: {
      session: {
        pages: {
          getInfo: (id: number) => infos.find((info) => info.pageId === id),
          known: () => infos,
        },
      },
    },
  } as unknown as BrowserToolCall
}

describe('sites AI never reads', () => {
  const sites = ['mybank.com']
  const pages = {
    1: 'https://login.mybank.com/home',
    2: 'https://news.example/',
  }

  it('refuses to read, capture or act on a listed site', () => {
    for (const tool of ['snapshot', 'read', 'screenshot', 'act', 'grep']) {
      const result = guardNeverReadSitesCall(
        call(tool, { page: 1 }, pages),
        sites,
      )
      expect(result?.isError).toBe(true)
    }
  })

  it('allows other sites, tab management, and everything when nothing is listed', () => {
    expect(
      guardNeverReadSitesCall(call('read', { page: 2 }, pages), sites),
    ).toBeNull()
    expect(
      guardNeverReadSitesCall(call('tabs', { page: 1 }, pages), sites),
    ).toBeNull()
    expect(
      guardNeverReadSitesCall(call('read', { page: 1 }, pages), []),
    ).toBeNull()
  })

  it('refuses scripts while a listed site is open anywhere', () => {
    expect(
      guardNeverReadSitesCall(call('run', { code: '1' }, pages), sites)
        ?.isError,
    ).toBe(true)
    expect(
      guardNeverReadSitesCall(
        call('run', { code: '1' }, { 2: pages[2] }),
        sites,
      ),
    ).toBeNull()
  })
})
