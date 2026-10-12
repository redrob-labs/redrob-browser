/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import type { Candidate } from '@browseros/hiring/candidate'
import { Hono } from 'hono'
import { createHiringRoutes } from '../../../src/api/routes/hiring'
import type { BackgroundReader } from '../../../src/api/services/background-reader'
import { ReadBudgetError } from '../../../src/api/services/background-reader'
import { HiringScreening } from '../../../src/api/services/hiring-screening'
import { HiringSourcing } from '../../../src/api/services/hiring-sourcing'
import { openBrowserOsDatabase } from '../../../src/lib/db/client'
import { HiringStore, RETENTION_MS } from '../../../src/lib/hiring/store'

const dirs: string[] = []
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() ?? '', { recursive: true, force: true })
})

const fixture = (name: string) =>
  gunzipSync(
    readFileSync(
      join(
        import.meta.dir,
        '../../../../../packages/hiring/tests/fixtures',
        `${name}.html.gz`,
      ),
    ),
  ).toString('utf8')

function setup(reader: BackgroundReader | null = null) {
  const dir = mkdtempSync(join(tmpdir(), 'redrob-hiring-'))
  dirs.push(dir)
  let clock = Date.UTC(2026, 9, 12, 2)
  const { db } = openBrowserOsDatabase({ dbPath: join(dir, 'db.sqlite') })
  const store = new HiringStore(db, {
    now: () => clock,
    saltPath: join(dir, 'salt'),
  })
  const sourcing = new HiringSourcing(store, reader, () => clock)
  const app = new Hono().route(
    '/hiring',
    createHiringRoutes({
      store,
      sourcing,
      screening: new HiringScreening(
        store,
        {
          label: async (_k: string, t: string[]) => ({
            texts: t,
            found: [],
            newDetails: 0,
            detection: 'patterns' as const,
          }),
          restore: (_k: string, t: string) => t,
          forget: () => {},
        },
        null,
      ),
    }),
  )
  return { dir, store, sourcing, app, advance: (ms: number) => (clock += ms) }
}

const json = (body: unknown, method = 'POST') => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

const person = (overrides: Partial<Candidate> = {}): Candidate => ({
  url: 'https://www.linkedin.com/in/jiwon',
  site: 'linkedin',
  name: 'Jiwon Kim',
  positions: [
    {
      title: 'Engineer',
      organisation: 'Northwind',
      start: '2018-01',
      current: true,
    },
  ],
  education: [],
  skills: ['Go'],
  location: 'Seoul',
  languages: [],
  links: [],
  contact: [],
  ...overrides,
})

describe('Talent Scout: roles and criteria', () => {
  it('creates a role, refuses proxy criteria in words, and versions every change', async () => {
    const { app, store } = setup()
    const created = await app.request(
      '/hiring/roles',
      json({
        title: 'Backend Engineer',
        criteria: [
          { text: '5+ years', kind: 'must' },
          { text: 'Go or Kotlin', kind: 'must' },
          { text: 'Recent graduate', kind: 'must' },
        ],
      }),
    )
    expect(created.status).toBe(201)
    const { role, refused } = (await created.json()) as {
      role: {
        id: string
        criteria: {
          version: number
          items: Array<{ text: string; check?: unknown }>
        }
      }
      refused: Array<{ text: string; reason: string }>
    }
    expect(refused).toEqual([{ text: 'Recent graduate', reason: 'age-proxy' }])
    expect(role.criteria.version).toBe(1)
    expect(role.criteria.items.map((c) => [c.text, Boolean(c.check)])).toEqual([
      ['5+ years', true],
      ['Go or Kotlin', true],
    ])
    const revised = (await (
      await app.request(
        `/hiring/roles/${role.id}/criteria`,
        json(
          {
            criteria: [
              { text: 'Built payment systems', kind: 'nice', inferred: true },
            ],
          },
          'PUT',
        ),
      )
    ).json()) as { criteria: { version: number } }
    expect(revised.criteria.version).toBe(2)
    expect(store.record(role.id).map((e) => e.kind)).toEqual([
      'role-created',
      'criteria-changed',
    ])
  })
})

describe('Talent Scout: people', () => {
  it('reads the open page, evaluates on the device, and one person across sites is one record', async () => {
    const { app, store } = setup()
    const { role } = store.createRole({
      title: 'Founder',
      criteria: [
        { text: '5+ years', kind: 'must' },
        { text: 'Based in Seattle', kind: 'must' },
        { text: 'Built payment systems', kind: 'nice' },
      ],
    })
    const res = await app.request(
      `/hiring/roles/${role.id}/people`,
      json({
        url: 'https://www.linkedin.com/in/jordan-example',
        html: fixture('linkedin-profile'),
      }),
    )
    const { results } = (await res.json()) as {
      results: Array<{ status: string; personId: string; isNew: boolean }>
    }
    expect(results).toHaveLength(1)
    expect(results[0]?.status).toBe('ok')
    const [onRole] = store.peopleOnRole(role.id)
    expect(onRole?.record.name).toBe('Jordan Example')
    expect(onRole?.evaluation?.results.map((r) => r.state)).toEqual([
      'met',
      'met',
      'unknown',
    ])
    expect([onRole?.evaluation?.met, onRole?.evaluation?.judged]).toEqual([
      2, 2,
    ])

    // The same person again, now linked from GitHub: one record, both sites.
    await store.upsertPerson(
      role.id,
      person({
        url: 'https://github.com/jordan',
        site: 'github',
        links: ['https://www.linkedin.com/in/jordan-example'],
      }),
    )
    expect(store.peopleOnRole(role.id)).toHaveLength(1)
    expect(store.peopleOnRole(role.id)[0]?.sites.sort()).toEqual([
      'github',
      'linkedin',
    ])
  })

  it('an unknown page is not read; a sign-in wall is reported', async () => {
    const { sourcing, store } = setup()
    const { role } = store.createRole({ title: 'r', criteria: [] })
    expect(
      await sourcing.fromOpenPage(role.id, {
        url: 'https://example.com/team',
        html: '',
      }),
    ).toEqual([{ url: 'https://example.com/team', status: 'unknown-site' }])
    expect(
      await sourcing.fromOpenPage(role.id, {
        url: 'https://www.linkedin.com/in/x',
        html: '<title>Security Verification</title>',
      }),
    ).toEqual([{ url: 'https://www.linkedin.com/in/x', status: 'blocked' }])
  })

  it('only the recruiter sets someone aside, and only with a reason', async () => {
    const { app, store } = setup()
    const { role } = store.createRole({ title: 'r', criteria: [] })
    const { personId } = await store.upsertPerson(role.id, person())
    expect(() =>
      store.setStage(
        role.id,
        personId,
        'set-aside',
        'redrob:automatic',
        'other',
      ),
    ).toThrow('only the recruiter')
    const noReason = await app.request(
      `/hiring/roles/${role.id}/people/${personId}`,
      json({ stage: 'set-aside' }, 'PATCH'),
    )
    expect(noReason.status).toBe(400)
    const ok = await app.request(
      `/hiring/roles/${role.id}/people/${personId}`,
      json({ stage: 'set-aside', reason: 'doesnt-meet-must-have' }, 'PATCH'),
    )
    expect(ok.status).toBe(200)
    const last = store.record(role.id).at(-1)
    expect(last).toMatchObject({
      kind: 'set-aside',
      actor: 'recruiter',
      detail: { reason: 'doesnt-meet-must-have' },
    })
  })

  it('an opt-out survives deletion as hashes only, and catches the person again', async () => {
    const { store, dir } = setup()
    const { role } = store.createRole({ title: 'r', criteria: [] })
    const { personId } = await store.upsertPerson(role.id, person())
    await store.suppress(personId)
    store.deletePerson(personId)
    expect(store.peopleOnRole(role.id)).toEqual([])
    const again = await store.upsertPerson(
      role.id,
      person({ url: 'https://kr.linkedin.com/in/Jiwon/' }),
    )
    expect(again.suppressed).toBe(true)
    expect(statSync(join(dir, 'salt')).mode & 0o777).toBe(0o600)
    expect(JSON.stringify(store.record())).not.toContain('Jiwon')
  })

  it('deletes people after 180 days without activity', async () => {
    const { store, advance } = setup()
    const { role } = store.createRole({ title: 'r', criteria: [] })
    await store.upsertPerson(role.id, person())
    advance(RETENTION_MS - 1)
    expect(store.purgeInactive()).toBe(0)
    advance(2)
    expect(store.purgeInactive()).toBe(1)
    expect(store.peopleOnRole(role.id)).toEqual([])
  })
})

describe('Talent Scout: reading a list in the background', () => {
  it('reads each profile through the reader with the site’s pace, and stops a site at its limit', async () => {
    const asked: Array<{ url: string; site?: string; minMs?: number }> = []
    let reads = 0
    const reader = {
      read: async (
        url: string,
        o: { site?: string; pace?: { minMs: number } },
      ) => {
        asked.push({ url, site: o.site, minMs: o.pace?.minMs })
        reads += 1
        if (reads > 1 && o.site === 'linkedin')
          throw new ReadBudgetError('used up')
        return { url, html: fixture('github-profile') }
      },
    } as unknown as BackgroundReader
    const { sourcing, store } = setup(reader)
    const { role } = store.createRole({ title: 'r', criteria: [] })
    const results = await sourcing.fromUrls(
      role.id,
      [
        'https://github.com/sam-example',
        'https://www.linkedin.com/in/a',
        'https://www.linkedin.com/in/b',
        'https://example.com/x',
      ],
      'Talent Scout · r',
    )
    expect(results.map((r) => r.status)).toEqual([
      'ok',
      'limit',
      'limit',
      'unknown-site',
    ])
    expect(asked.map((a) => a.site)).toEqual(['github', 'linkedin'])
    expect(asked[0]?.minMs).toBe(4_000)
  })
})
