/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'
import { createPrivacyRoutes } from '../../../src/api/routes/privacy'
import { DetectorSource } from '../../../src/lib/privacy/detector-source'
import { ExtensionUnavailableError } from '../../../src/lib/privacy/extension-worker'
import {
  PrivacyGate,
  TeamPolicyLockedError,
} from '../../../src/lib/privacy/gate'
import { PrivacySettingsStore } from '../../../src/lib/privacy/settings'
import {
  TEAM_POLICY_JWS_TYPE,
  verifyTeamPolicyJws,
} from '../../../src/lib/privacy/team-policy/jws'
import {
  PRODUCTION_KEYS,
  TEST_KEYS,
  trustedKeys,
} from '../../../src/lib/privacy/team-policy/keys'
import {
  type ManagedPolicyReader,
  TeamPolicySource,
} from '../../../src/lib/privacy/team-policy/source'
import testKeys from './fixtures/team-policy/test-keys.json'
import vectors from './fixtures/team-policy/vectors.json'

const dirs: string[] = []
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() ?? '', { recursive: true, force: true })
})

const b64 = (value: string | Uint8Array) =>
  Buffer.from(value).toString('base64url')

async function sign(payload: unknown, kid = 'test-2026-10-active') {
  const signer = testKeys.keys.find((k) => k.kid === kid) ?? testKeys.keys[0]
  const header = { alg: 'ES256', typ: TEAM_POLICY_JWS_TYPE, kid }
  const input = `${b64(JSON.stringify(header))}.${b64(JSON.stringify(payload))}`
  const key = await crypto.subtle.importKey(
    'jwk',
    signer?.jwk as JsonWebKey,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      new TextEncoder().encode(input),
    ),
  )
  return `${input}.${b64(signature)}`
}

function policy(
  overrides: {
    version?: number
    level?: 'off' | 'standard' | 'high' | 'strict'
    locked?: boolean
    names?: string[][]
    shiftDates?: boolean
  } = {},
) {
  return {
    v: 1,
    accountId: 'acc_team',
    version: overrides.version ?? 1,
    issuedAt: '2026-10-06T00:00:00.000Z',
    setBy: { userId: 'usr_admin', name: 'Park Hyunjin', role: 'admin' },
    privacy: {
      level: overrides.level ?? 'high',
      locked: overrides.locked ?? true,
      names: overrides.names ?? [['Acme Robotics']],
      keep: {},
      transforms: overrides.shiftDates ? { shiftDates: true } : {},
    },
    notes: [],
    connectors: { allow: [], allowLocalPrograms: false },
    playbooks: [],
    skills: [],
  }
}

function reader(initial: string | null | Error): ManagedPolicyReader & {
  value: string | null | Error
} {
  const r = {
    value: initial,
    read: async () => {
      if (r.value instanceof Error) throw r.value
      return r.value
    },
  }
  return r
}

function setup(
  read: ManagedPolicyReader | null,
  level: 'standard' | 'off' = 'standard',
) {
  const dir = mkdtempSync(join(tmpdir(), 'redrob-team-'))
  dirs.push(dir)
  const source = new TeamPolicySource(
    read,
    join(dir, 'team-policy.json'),
    () => TEST_KEYS,
  )
  const settings = new PrivacySettingsStore(join(dir, 'privacy.json'))
  const gate = new PrivacyGate(
    settings,
    new DetectorSource({
      directory: join(dir, 'model'),
      fetchFile: async () => {
        throw new Error('offline')
      },
    }),
    undefined,
    source,
  )
  return { dir, source, settings, gate, ready: gate.update({ level }) }
}

describe('team policy verification (the shared vectors with Cowork and the console)', () => {
  for (const vector of vectors.vectors) {
    it(vector.name, async () => {
      const outcome = await verifyTeamPolicyJws(vector.jws, TEST_KEYS).then(
        (v) => ({
          ok: true as const,
          accountId: v.policy.accountId,
          version: v.policy.version,
        }),
        (error: { code?: string }) => ({
          ok: false as const,
          code: error.code,
        }),
      )
      expect(outcome).toEqual(vector.expect as typeof outcome)
    })
  }

  it('trusts no key at all in a packaged build until the console’s keys are pinned', () => {
    expect(PRODUCTION_KEYS).toHaveLength(0)
    expect(trustedKeys({})).toHaveLength(0)
    expect(trustedKeys({ REDROB_DEV_MODE: '1' })).toHaveLength(TEST_KEYS.length)
  })
})

describe('the managed policy, applied by the gate', () => {
  it('locks the level, adds the team’s names, and refuses a change to the level', async () => {
    const { source, gate, ready } = setup(reader(await sign(policy())))
    await ready
    await source.start()
    source.stop()
    expect(gate.level()).toBe('high')
    expect(gate.rules().names).toEqual([['Acme Robotics']])
    await expect(gate.update({ level: 'off' })).rejects.toBeInstanceOf(
      TeamPolicyLockedError,
    )
    // The person's own list still changes; the team's names stay on top of it.
    await gate.update({ names: [['Jiwon Kim']] })
    expect(gate.rules().names).toEqual([['Jiwon Kim'], ['Acme Robotics']])
    const status = gate.status()
    expect(status.level).toBe('high')
    expect(status.names).toEqual([['Jiwon Kim']])
    expect(status.team).toEqual({
      state: 'active',
      accountId: 'acc_team',
      version: 1,
      setBy: 'Park Hyunjin',
      level: 'high',
      locked: true,
      names: 1,
    })
  })

  it('applies an unlocked level once, then leaves it to the person', async () => {
    const { source, gate, ready } = setup(
      reader(await sign(policy({ locked: false, level: 'strict' }))),
    )
    await ready
    await source.start()
    source.stop()
    await Bun.sleep(5)
    expect(gate.level()).toBe('strict')
    await gate.update({ level: 'standard' })
    await source.refresh()
    await Bun.sleep(5)
    expect(gate.level()).toBe('standard')
  })

  it('refuses a replayed older version and keeps the newer one in force', async () => {
    const r = reader(await sign(policy({ version: 2, level: 'strict' })))
    const { source, gate, ready } = setup(r)
    await ready
    await source.start()
    source.stop()
    r.value = await sign(policy({ version: 1, level: 'off', locked: false }))
    await source.refresh()
    expect(source.state()).toMatchObject({
      state: 'refused',
      code: 'team_policy_stale',
    })
    expect(gate.level()).toBe('strict')
  })

  it('refuses a policy signed by a key this build does not pin', async () => {
    const forged = (await sign(policy())).replace(
      /^[^.]+/,
      b64(
        JSON.stringify({
          alg: 'ES256',
          typ: TEAM_POLICY_JWS_TYPE,
          kid: 'evil',
        }),
      ),
    )
    const { source, gate, ready } = setup(reader(forged))
    await ready
    await source.start()
    source.stop()
    expect(source.state()).toMatchObject({
      state: 'refused',
      code: 'team_policy_unknown_key',
    })
    expect(gate.level()).toBe('standard')
    expect(gate.status().team).toEqual({
      state: 'refused',
      refused: 'team_policy_unknown_key',
      locked: false,
      names: 0,
    })
  })

  it('holds across a restart, survives a failed read, and is dropped when the device loses it', async () => {
    const r = reader(await sign(policy()))
    const first = setup(r)
    await first.ready
    await first.source.start()
    first.source.stop()
    expect(existsSync(join(first.dir, 'team-policy.json'))).toBe(true)

    // A restart, with the extension not awake yet: the stored policy is in force from the start.
    const asleep = reader(new ExtensionUnavailableError('asleep'))
    const again = new TeamPolicySource(
      asleep,
      join(first.dir, 'team-policy.json'),
      () => TEST_KEYS,
    )
    await again.start()
    again.stop()
    expect(again.policy()?.policy.accountId).toBe('acc_team')

    // The admin removed the policy from the device.
    asleep.value = null
    await again.refresh()
    expect(again.state()).toEqual({ state: 'none' })
    expect(existsSync(join(first.dir, 'team-policy.json'))).toBe(false)
  })

  it('shifts dates per chat when the team asks, by a fixed non-zero number of days', async () => {
    const { source, gate, ready } = setup(
      reader(await sign(policy({ shiftDates: true }))),
    )
    await ready
    await source.start()
    source.stop()
    const [text] = (await gate.label('c1', ['Due 2026-10-11.'])).texts
    expect(text).not.toBe('Due 2026-10-11.')
    expect(text).toMatch(/^Due \d{4}-\d{2}-\d{2}\.$/)
  })

  it('answers 409 to a locked change over HTTP, and re-reads the device on request', async () => {
    const r = reader(null)
    const { source, gate, ready } = setup(r)
    await ready
    const app = new Hono().route('/privacy', createPrivacyRoutes({ gate }))
    r.value = await sign(policy())
    const refreshed = (await (
      await app.request('/privacy/team', { method: 'POST' })
    ).json()) as {
      level: string
    }
    expect(refreshed.level).toBe('high')
    const refused = await app.request('/privacy', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ level: 'off' }),
    })
    expect(refused.status).toBe(409)
    source.stop()
  })

  it('shows no team at all on a device without a policy', async () => {
    const { gate, ready } = setup(reader(null))
    await ready
    expect(gate.status().team).toBeNull()
  })
})
