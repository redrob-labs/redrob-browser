/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Candidate } from '@browseros/hiring/candidate'
import { activeCriteria } from '@browseros/hiring/criteria'
import { evaluate } from '@browseros/hiring/evaluate'
import { HiringOutreach } from '../../../src/api/services/hiring-outreach'
import { HiringSourcing } from '../../../src/api/services/hiring-sourcing'
import { openBrowserOsDatabase } from '../../../src/lib/db/client'
import type { HiringPolicy } from '../../../src/lib/hiring/policy'
import { hiringPolicyStatus } from '../../../src/lib/hiring/policy'
import { HiringStore } from '../../../src/lib/hiring/store'
import { teamPolicySchema } from '../../../src/lib/privacy/team-policy/policy'

const dirs: string[] = []
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() ?? '', { recursive: true, force: true })
})

const base = {
  v: 1,
  accountId: 'acc',
  version: 1,
  issuedAt: '2026-10-06T00:00:00.000Z',
  setBy: { userId: 'u', name: 'Admin', role: 'admin' },
  privacy: { level: 'high', locked: true, names: [], keep: {}, transforms: {} },
  notes: [],
  connectors: { allow: [], allowLocalPrograms: false },
  playbooks: [],
  skills: [],
}

const jiwon: Candidate = {
  url: 'https://www.linkedin.com/in/jiwon',
  site: 'linkedin',
  name: 'Jiwon Kim',
  positions: [{ title: 'Engineer', start: '2017-01', current: true }],
  education: [],
  skills: [],
  location: 'Seoul',
  languages: [],
  links: [],
  contact: [],
}

async function setup(policy: HiringPolicy | null) {
  const dir = mkdtempSync(join(tmpdir(), 'redrob-hpolicy-'))
  dirs.push(dir)
  let clock = Date.UTC(2026, 9, 12, 2)
  const { db } = openBrowserOsDatabase({ dbPath: join(dir, 'db.sqlite') })
  const store = new HiringStore(db, {
    now: () => clock,
    saltPath: join(dir, 'salt'),
    retentionDays: () => policy?.retentionDays,
  })
  const gate = {
    label: async (_k: string, t: string[]) => ({
      texts: t,
      found: [],
      newDetails: 0,
      detection: 'patterns' as const,
    }),
    restore: (_k: string, t: string) => t,
    forget: () => {},
  }
  const outreach = new HiringOutreach(store, gate, null, {
    now: () => clock,
    timeZone: 'Asia/Seoul',
    policy: () => policy,
  })
  const sourcing = new HiringSourcing(
    store,
    null,
    () => clock,
    () => policy?.regions ?? null,
  )
  const { role } = store.createRole({
    title: 'r',
    location: 'Seoul',
    mode: 'automatic',
    criteria: [{ text: '5+ years', kind: 'must' }],
  })
  const { personId } = await store.upsertPerson(role.id, jiwon)
  const fresh = store.getRole(role.id)
  if (!fresh) throw new Error()
  store.setEvaluation(
    role.id,
    personId,
    evaluate(
      jiwon,
      { version: 1, items: activeCriteria(fresh.criteria) },
      [],
      new Date(clock),
    ),
  )
  return {
    store,
    outreach,
    sourcing,
    role,
    personId,
    advance: (ms: number) => (clock += ms),
  }
}

describe('the hiring block of a team policy', () => {
  it('is optional, so every earlier policy still verifies, and strict', () => {
    expect(teamPolicySchema.safeParse(base).success).toBe(true)
    expect(
      teamPolicySchema.safeParse({
        ...base,
        hiring: { automatic: false, retentionDays: 90 },
      }).success,
    ).toBe(true)
    // It cannot lengthen retention, and it has no field that turns on rejections.
    expect(
      teamPolicySchema.safeParse({
        ...base,
        hiring: { automatic: true, retentionDays: 365 },
      }).success,
    ).toBe(false)
    expect(
      teamPolicySchema.safeParse({
        ...base,
        hiring: { automatic: true, autoReject: true },
      }).success,
    ).toBe(false)
  })

  it('turns Automatic off: a message to someone who meets every must have waits for the recruiter', async () => {
    const on = await setup(null)
    const a = await on.outreach.draft(on.role.id, on.personId, {
      notice: 'n',
      language: 'en',
      body: 'Hi',
    })
    expect(a.status === 'drafted' && a.message.status).toBe('approved')
    const off = await setup({ automatic: false })
    const b = await off.outreach.draft(off.role.id, off.personId, {
      notice: 'n',
      language: 'en',
      body: 'Hi',
    })
    expect(b.status === 'drafted' && b.message.status).toBe('draft')
  })

  it('lowers the day’s cap on a site', async () => {
    const { outreach, role, personId } = await setup({
      automatic: true,
      perSitePerDay: { linkedin: 0 },
    })
    const m = await outreach.draft(role.id, personId, {
      notice: 'n',
      language: 'en',
      body: 'Hi',
    })
    if (m.status !== 'drafted') throw new Error()
    await expect(outreach.start(m.message.id, 'c1')).rejects.toMatchObject({
      code: 'daily-cap',
    })
  })

  it('shortens retention, and keeps Talent Scout to its regions', async () => {
    const { store, sourcing, role, advance } = await setup({
      automatic: true,
      retentionDays: 30,
      regions: ['IN'],
    })
    advance(31 * 86_400_000)
    expect(store.purgeInactive()).toBe(1)
    expect(
      await sourcing.fromOpenPage(role.id, {
        url: 'https://www.saramin.co.kr/zf_user/memcom/resume/1',
        html: '',
      }),
    ).toEqual([
      {
        url: 'https://www.saramin.co.kr/zf_user/memcom/resume/1',
        status: 'region',
      },
    ])
    expect(
      hiringPolicyStatus({
        automatic: false,
        auditHref: 'https://audit.example/',
      }),
    ).toEqual({
      automatic: false,
      retentionDays: 180,
      regions: null,
      auditHref: 'https://audit.example/',
      noticeHref: null,
    })
  })
})
