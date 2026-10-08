/**
 * @license
 * Copyright 2026 Redrob
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'bun:test'
import {
  resolveRedrobEngine,
  stderrSaysCommandNotFound,
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
