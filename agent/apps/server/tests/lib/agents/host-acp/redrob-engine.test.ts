/**
 * @license
 * Copyright 2026 Redrob
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'bun:test'
import {
  resolveRedrobEngine,
  stderrSaysCommandNotFound,
  withSharedEngine,
} from '../../../../src/lib/agents/host-acp/redrob-engine'

const WIN_ENV = {
  LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local',
  USERPROFILE: 'C:\\Users\\u',
  Path: 'C:\\Windows\\System32',
}

describe('resolveRedrobEngine', () => {
  it('uses the Windows installer location when PATH cannot find redrob', () => {
    const installed = 'C:\\Users\\u\\AppData\\Local\\Redrob\\bin\\redrob.exe'
    const exists = (p: string) => p === installed
    expect(resolveRedrobEngine('redrob', 'win32', WIN_ENV, exists)).toBe(
      installed,
    )
  })

  it('falls back to ~/.redrob/bin, where the browser installs the engine', () => {
    const installed = 'C:\\Users\\u\\.redrob\\bin\\redrob.exe'
    const exists = (p: string) => p === installed
    expect(resolveRedrobEngine('redrob', 'win32', WIN_ENV, exists)).toBe(
      installed,
    )
  })

  it('keeps the bare name when PATH already resolves it', () => {
    const exists = (p: string) =>
      p === 'C:\\Windows\\System32\\redrob.exe' ||
      p === 'C:\\Users\\u\\AppData\\Local\\Redrob\\bin\\redrob.exe'
    expect(resolveRedrobEngine('redrob', 'win32', WIN_ENV, exists)).toBe(
      'redrob',
    )
  })

  it('keeps the bare name when nothing is installed, so the error stays the shell one', () => {
    expect(resolveRedrobEngine('redrob', 'win32', WIN_ENV, () => false)).toBe(
      'redrob',
    )
  })

  it('never touches another command', () => {
    expect(resolveRedrobEngine('opencode', 'win32', WIN_ENV, () => true)).toBe(
      'opencode',
    )
  })

  it('checks ~/.redrob/bin on POSIX', () => {
    const exists = (p: string) => p === '/home/u/.redrob/bin/redrob'
    expect(
      resolveRedrobEngine(
        'redrob',
        'linux',
        { HOME: '/home/u', PATH: '/usr/bin' },
        exists,
      ),
    ).toBe('/home/u/.redrob/bin/redrob')
  })
})

describe('withSharedEngine', () => {
  it('attaches `redrob acp` to the shared engine daemon', () => {
    expect(withSharedEngine(['redrob', 'acp'])).toEqual([
      'redrob',
      'acp',
      '--attach',
    ])
  })

  it('keeps extra arguments after the flag', () => {
    expect(withSharedEngine(['redrob', 'acp', '--cwd', '/w'])).toEqual([
      'redrob',
      'acp',
      '--attach',
      '--cwd',
      '/w',
    ])
  })

  it('recognises a resolved install path on either platform', () => {
    expect(
      withSharedEngine([
        'C:\\Users\\u\\AppData\\Local\\Redrob\\bin\\redrob.exe',
        'acp',
      ]),
    ).toEqual([
      'C:\\Users\\u\\AppData\\Local\\Redrob\\bin\\redrob.exe',
      'acp',
      '--attach',
    ])
    expect(withSharedEngine(['/home/u/.redrob/bin/redrob', 'acp'])).toEqual([
      '/home/u/.redrob/bin/redrob',
      'acp',
      '--attach',
    ])
  })

  it('does not add the flag twice', () => {
    expect(withSharedEngine(['redrob', 'acp', '--attach'])).toEqual([
      'redrob',
      'acp',
      '--attach',
    ])
  })

  it('leaves other engine subcommands and other agents alone', () => {
    expect(withSharedEngine(['redrob', 'serve'])).toEqual(['redrob', 'serve'])
    expect(withSharedEngine(['redrob'])).toEqual(['redrob'])
    expect(withSharedEngine(['opencode', 'acp'])).toEqual(['opencode', 'acp'])
    expect(withSharedEngine(['redrob-cli', 'acp'])).toEqual([
      'redrob-cli',
      'acp',
    ])
  })

  it("returns a copy, never the caller's array", () => {
    const argv = ['redrob', 'acp']
    const out = withSharedEngine(argv)
    expect(out).not.toBe(argv)
    expect(argv).toEqual(['redrob', 'acp'])
  })
})

describe('stderrSaysCommandNotFound', () => {
  it('recognises cmd.exe, sh and env', () => {
    expect(
      stderrSaysCommandNotFound(
        "'redrob' is not recognized as an internal or external command,",
      ),
    ).toBe(true)
    expect(stderrSaysCommandNotFound('sh: 1: redrob: not found')).toBe(true)
    expect(
      stderrSaysCommandNotFound('env: redrob: No such file or directory'),
    ).toBe(true)
  })

  it('does not mistake a crash for a missing program', () => {
    expect(stderrSaysCommandNotFound('Error: boom')).toBe(false)
    expect(stderrSaysCommandNotFound(undefined)).toBe(false)
  })
})
