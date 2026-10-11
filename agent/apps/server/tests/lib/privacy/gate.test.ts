/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { EntityDetector } from '@browseros/privacy/detector'
import { toChatError } from '../../../src/agent/chat-error'
import { DetectorSource } from '../../../src/lib/privacy/detector-source'
import { PrivacyGate, PrivacyGateError } from '../../../src/lib/privacy/gate'
import {
  isNeverReadSite,
  isoWeek,
  normaliseSite,
  PrivacySettingsStore,
} from '../../../src/lib/privacy/settings'

const dirs: string[] = []
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() ?? '', { recursive: true, force: true })
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'redrob-privacy-'))
  dirs.push(dir)
  return dir
}

/** A gate on a temporary settings file and an empty model directory: patterns only. */
function gateWith(
  level: 'off' | 'standard' | 'high' | 'strict',
  options: { detector?: EntityDetector; now?: () => Date } = {},
) {
  const dir = tempDir()
  const settings = new PrivacySettingsStore(
    join(dir, 'privacy.json'),
    options.now,
  )
  const detectors = new DetectorSource({
    directory: join(dir, 'model'),
    fetchFile: async () => {
      throw new Error('offline')
    },
  })
  if (options.detector) {
    const detector = options.detector
    Object.assign(detectors, {
      get: async () => detector,
      detect: (d: EntityDetector, text: string) => d.detect(text),
    })
  }
  const gate = new PrivacyGate(settings, detectors)
  return { gate, settings, dir, ready: gate.update({ level }) }
}

describe('PrivacyGate', () => {
  it('labels details for the model and gives the real values back', async () => {
    const { gate, ready } = gateWith('standard')
    await ready
    const { texts, found, newDetails } = await gate.label('c1', [
      'Email jiwon@example.com or call 010-1234-5678.',
    ])
    expect(texts[0]).toBe('Email [EMAIL_1] or call [PHONE_1].')
    expect(found.sort()).toEqual(['EMAIL', 'PHONE'])
    expect(newDetails).toBe(2)
    expect(gate.restore('c1', 'Sent to [EMAIL_1].')).toBe(
      'Sent to jiwon@example.com.',
    )
    expect(gate.restoreDeep('c1', { to: '[EMAIL_1]', n: 2 })).toEqual({
      to: 'jiwon@example.com',
      n: 2,
    })
  })

  it('keeps one label per detail across turns, and counts a detail once', async () => {
    const { gate, settings, ready } = gateWith('standard')
    await ready
    await gate.label('c1', ['jiwon@example.com'])
    const again = await gate.label('c1', ['Again: jiwon@example.com'])
    expect(again.texts[0]).toBe('Again: [EMAIL_1]')
    expect(again.newDetails).toBe(0)
    expect(settings.keptThisWeek()).toBe(1)
    // Another conversation has its own labels.
    expect(gate.restore('c2', '[EMAIL_1]')).toBe('[EMAIL_1]')
  })

  it('keeps API keys and tokens from the model, and puts them back in tool input', async () => {
    const { gate, ready } = gateWith('standard')
    await ready
    const key = 'sk-proj-abcdefghijklmnopqrstuvwx'
    const { texts } = await gate.label('c1', [
      `Paste ${key} into the form. Header: Bearer abcdefghijklmnop.qrs`,
    ])
    expect(texts[0]).not.toContain(key)
    expect(texts[0]).not.toContain('abcdefghijklmnop.qrs')
    expect(texts[0]).toContain('[SECRET_1]')
    expect(texts[0]).toContain('Bearer [SECRET_2]')
    expect(gate.restoreDeep('c1', { text: '[SECRET_1]' })).toEqual({
      text: key,
    })
  })

  it('does nothing when it is off', async () => {
    const { gate, ready } = gateWith('off')
    await ready
    const text = 'jiwon@example.com'
    expect((await gate.label('c1', [text])).texts[0]).toBe(text)
    expect(gate.instruction('c1')).toBeNull()
  })

  it('labels deep values string by string, leaving the shape', async () => {
    const { gate, ready } = gateWith('standard')
    await ready
    expect(
      await gate.labelDeep('c1', {
        fields: [{ name: 'email', value: 'a@b.co' }],
        n: 1,
      }),
    ).toEqual({ fields: [{ name: 'email', value: '[EMAIL_1]' }], n: 1 })
  })

  it('uses the model at High for organisations and addresses, and fails closed when it breaks', async () => {
    const detector: EntityDetector = {
      id: 'fake',
      detect: async (text) => {
        if (text.includes('BREAK')) throw new Error('runtime crashed')
        const start = text.indexOf('Acme Robotics')
        return start < 0
          ? []
          : [
              {
                category: 'ORG',
                start,
                end: start + 13,
                value: 'Acme Robotics',
                score: 0.99,
              },
            ]
      },
    }
    const { gate, ready } = gateWith('high', { detector })
    await ready
    const { texts, detection } = await gate.label('c1', ['Acme Robotics paid.'])
    expect(texts[0]).toBe('[ORG_1] paid.')
    expect(detection).toBe('model')
    const failure = await gate.label('c1', ['BREAK']).catch((error) => error)
    expect(failure).toBeInstanceOf(PrivacyGateError)
    expect(toChatError(failure).title).toBe(
      'Privacy Protection stopped this message',
    )
  })

  it('reports status without any value it labelled', async () => {
    const { gate, ready } = gateWith('standard')
    await ready
    await gate.update({ names: [['김지원', 'Jiwon Kim']] })
    await gate.label('c1', ['jiwon@example.com'])
    const status = gate.status()
    expect(status).toMatchObject({
      level: 'standard',
      names: [['김지원', 'Jiwon Kim']],
      keptThisWeek: 1,
      coverage: { redrobAgent: true, externalAgents: false },
    })
    expect(JSON.stringify(status)).not.toContain('jiwon@example.com')
  })
})

describe('privacy settings', () => {
  it('persists updates, normalises sites, and reads a broken file as defaults', async () => {
    const dir = tempDir()
    const path = join(dir, 'privacy.json')
    const store = new PrivacySettingsStore(path)
    await store.update({
      level: 'strict',
      neverReadSites: ['https://www.MyBank.com/login', 'mybank.com', 'gov.kr'],
    })
    const reread = new PrivacySettingsStore(path).get()
    expect(reread.level).toBe('strict')
    expect(reread.neverReadSites).toEqual(['mybank.com', 'gov.kr'])
    expect(readFileSync(path, 'utf8')).not.toContain('kept":{"week":"x')

    const broken = join(dir, 'broken.json')
    await Bun.write(broken, '{ not json')
    expect(new PrivacySettingsStore(broken).get().level).toBe('standard')
  })

  it('weekly counts reset with the ISO week', async () => {
    let now = new Date('2026-10-11T12:00:00Z')
    const store = new PrivacySettingsStore(join(tempDir(), 'p.json'), () => now)
    await store.addKept(3)
    expect(store.keptThisWeek()).toBe(3)
    now = new Date('2026-10-12T12:00:00Z')
    expect(store.keptThisWeek()).toBe(0)
    expect(isoWeek(new Date('2026-10-11T00:00:00Z'))).toBe('2026-W41')
    expect(isoWeek(new Date('2027-01-01T00:00:00Z'))).toBe('2026-W53')
  })

  it('matches a listed site and its subdomains, nothing else', () => {
    expect(normaliseSite(' HTTPS://WWW.Example.COM/x ')).toBe('example.com')
    const sites = ['mybank.com']
    expect(isNeverReadSite('https://mybank.com/a', sites)).toBe(true)
    expect(isNeverReadSite('https://login.mybank.com/', sites)).toBe(true)
    expect(isNeverReadSite('https://notmybank.com/', sites)).toBe(false)
    expect(isNeverReadSite('chrome://newtab', sites)).toBe(false)
  })
})
