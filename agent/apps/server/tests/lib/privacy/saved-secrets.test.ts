/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DetectorSource } from '../../../src/lib/privacy/detector-source'
import { PrivacyGate } from '../../../src/lib/privacy/gate'
import {
  chunks,
  detectedFrom,
  ExtensionSavedSecrets,
  mergeSpans,
  type SavedSecretScanner,
  type SavedSecretSpan,
} from '../../../src/lib/privacy/saved-secrets'
import { PrivacySettingsStore } from '../../../src/lib/privacy/settings'

const dirs: string[] = []
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() ?? '', { recursive: true, force: true })
})

/** What the browser would answer: every occurrence of each saved value. */
function browserWith(
  saved: Array<{ value: string; kind: SavedSecretSpan['kind'] }>,
) {
  return (text: string) => {
    const spans: SavedSecretSpan[] = []
    for (const { value, kind } of saved) {
      for (
        let i = text.indexOf(value);
        i >= 0;
        i = text.indexOf(value, i + 1)
      ) {
        spans.push({ start: i, end: i + value.length, kind })
      }
    }
    return { ready: true, spans }
  }
}

function fakeCdp(answer: (text: string) => unknown, targets?: unknown[]) {
  const calls: string[] = []
  const cdp = async (method: string, params?: Record<string, unknown>) => {
    calls.push(method)
    if (method === 'Target.getTargets') {
      return {
        targetInfos: targets ?? [
          { targetId: 'p', type: 'page', url: 'https://example.com/' },
          {
            targetId: 'sw',
            type: 'service_worker',
            url: 'chrome-extension://oikpnmkappjhkifbcieakjoeiknojbgg/background.js',
          },
        ],
      }
    }
    if (method === 'Target.attachToTarget') {
      expect(params?.targetId).toBe('sw')
      return { sessionId: 's1' }
    }
    if (method === 'Runtime.evaluate') {
      const expression = String(params?.expression)
      const literal = /scanForSavedSecrets\((".*")\)/s.exec(expression)?.[1]
      return { result: { value: answer(JSON.parse(literal ?? '""')) } }
    }
    throw new Error(`unexpected ${method}`)
  }
  return { cdp, calls }
}

describe('saved-secret scan through the agent extension', () => {
  it('asks the extension worker and answers spans, never sending anything off the machine', async () => {
    const { cdp, calls } = fakeCdp(
      browserWith([{ value: 'Tr0ub4dor&3', kind: 'password' }]),
    )
    const scanner = new ExtensionSavedSecrets(cdp)
    const scan = await scanner.scan('my password is Tr0ub4dor&3')
    expect(scan).toEqual({
      state: 'ready',
      spans: [{ start: 15, end: 26, kind: 'password' }],
    })
    expect(calls).toEqual([
      'Target.getTargets',
      'Target.attachToTarget',
      'Runtime.evaluate',
    ])
    // The same text again within a minute is not asked twice.
    await scanner.scan('my password is Tr0ub4dor&3')
    expect(calls.filter((c) => c === 'Runtime.evaluate')).toHaveLength(1)
  })

  it('is unavailable when the browser has no such API or no worker is running', async () => {
    expect(
      await new ExtensionSavedSecrets(fakeCdp(() => null).cdp).scan('x y'),
    ).toEqual({
      state: 'unavailable',
    })
    expect(
      await new ExtensionSavedSecrets(fakeCdp(() => null, []).cdp).scan('x y'),
    ).toEqual({ state: 'unavailable' })
    expect(
      await new ExtensionSavedSecrets(
        fakeCdp(() => ({ ready: false, spans: [] })).cdp,
      ).scan('x y'),
    ).toEqual({ state: 'unavailable' })
  })

  it('scans a long text in overlapping pieces and finds a value across a cut', async () => {
    const value = 'correct-horse-battery'
    const text = `${'a '.repeat(29_995)}${value} tail`
    const pieces = chunks(text)
    expect(pieces.length).toBeGreaterThan(1)
    const { cdp } = fakeCdp(browserWith([{ value, kind: 'password' }]))
    const scan = await new ExtensionSavedSecrets(cdp).scan(text)
    expect(scan.state).toBe('ready')
    if (scan.state !== 'ready') return
    expect(scan.spans).toHaveLength(1)
    const [span] = scan.spans
    expect(text.slice(span?.start, span?.end)).toBe(value)
  })

  it('merges the copies a cut makes, and turns spans into values to label', () => {
    expect(
      mergeSpans([
        { start: 10, end: 20, kind: 'name' },
        { start: 10, end: 20, kind: 'name' },
        { start: 0, end: 4, kind: 'email' },
      ]),
    ).toEqual([
      { start: 0, end: 4, kind: 'email' },
      { start: 10, end: 20, kind: 'name' },
    ])
    expect(
      detectedFrom('pw hunter222 and 4111111111111111', [
        { start: 3, end: 12, kind: 'password' },
        { start: 17, end: 33, kind: 'card' },
      ]),
    ).toEqual([
      { category: 'SECRET', value: 'hunter222' },
      { category: 'CARD', value: '4111111111111111' },
    ])
  })
})

describe('PrivacyGate with saved secrets', () => {
  function gateWith(level: 'off' | 'standard', scanner: SavedSecretScanner) {
    const dir = mkdtempSync(join(tmpdir(), 'redrob-saved-'))
    dirs.push(dir)
    const settings = new PrivacySettingsStore(join(dir, 'privacy.json'))
    const gate = new PrivacyGate(
      settings,
      new DetectorSource({
        directory: join(dir, 'model'),
        fetchFile: async () => {
          throw new Error('offline')
        },
      }),
      scanner,
    )
    return { gate, ready: gate.update({ level }) }
  }

  const scanner = (
    saved: Array<{ value: string; kind: SavedSecretSpan['kind'] }>,
  ) => {
    const answer = browserWith(saved)
    return {
      scan: async (text: string) => ({
        state: 'ready' as const,
        ...answer(text),
      }),
    }
  }

  it('labels a saved password and card even with Privacy Protection off, and nothing else', async () => {
    const { gate, ready } = gateWith(
      'off',
      scanner([
        { value: 'Tr0ub4dor&3', kind: 'password' },
        { value: 'jiwon@example.com', kind: 'email' },
      ]),
    )
    await ready
    const { texts, found } = await gate.label('c1', [
      'log in with jiwon@example.com and Tr0ub4dor&3, call 010-1234-5678',
    ])
    expect(texts[0]).toBe(
      'log in with jiwon@example.com and [SECRET_1], call 010-1234-5678',
    )
    expect(found).toEqual(['SECRET'])
    expect(gate.restore('c1', texts[0] ?? '')).toContain('Tr0ub4dor&3')
    expect(gate.status().savedSecrets).toBe('on')
  })

  it('adds the browser’s finds to the patterns at Standard', async () => {
    const { gate, ready } = gateWith(
      'standard',
      scanner([{ value: 'hunter-two-22', kind: 'password' }]),
    )
    await ready
    const [text] = (
      await gate.label('c1', ['pw hunter-two-22 mail a.b@example.org'])
    ).texts
    expect(text).toBe('pw [SECRET_1] mail [EMAIL_1]')
  })

  it('says so when the browser cannot answer, and labels with patterns alone', async () => {
    const { gate, ready } = gateWith('standard', {
      scan: async () => ({ state: 'unavailable' }),
    })
    await ready
    const [text] = (await gate.label('c1', ['mail a.b@example.org'])).texts
    expect(text).toBe('mail [EMAIL_1]')
    expect(gate.status().savedSecrets).toBe('unavailable')
  })
})
