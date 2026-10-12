/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ConnectableAts } from '@browseros/hiring/ats'
import type { Candidate } from '@browseros/hiring/candidate'
import {
  type AtsCredentialStore,
  HiringAts,
} from '../../../src/api/services/hiring-ats'
import type { BrowserToolCall } from '../../../src/api/services/mcp/browser-tool-dispatch'
import {
  applyHiringAts,
  guardHiringAts,
  setAtsSource,
} from '../../../src/api/services/mcp/guards/hiring-ats'
import { openBrowserOsDatabase } from '../../../src/lib/db/client'
import {
  type AtsCredential,
  atsClient,
} from '../../../src/lib/hiring/ats-clients'
import { HiringStore } from '../../../src/lib/hiring/store'

const dirs: string[] = []
afterEach(() => {
  setAtsSource(null)
  while (dirs.length) rmSync(dirs.pop() ?? '', { recursive: true, force: true })
})

const jiwon: Candidate = {
  url: 'https://www.linkedin.com/in/jiwon',
  site: 'linkedin',
  name: 'Jiwon Kim',
  headline: 'Backend engineer',
  positions: [{ title: 'Engineer', start: '2017-01', current: true }],
  education: [],
  skills: ['Go'],
  languages: [],
  links: [],
  contact: [{ kind: 'email', value: 'jiwon@example.com' }],
}

type Request = { url: string; method: string; auth: string; body: string }

function mockFetch(answer: (r: Request) => unknown) {
  const seen: Request[] = []
  const fetcher = async (url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    const r = {
      url,
      method: init?.method ?? 'GET',
      auth: headers.get('authorization') ?? '',
      body: String(init?.body ?? ''),
    }
    seen.push(r)
    const out = answer(r)
    if (out instanceof Response) return out
    return Response.json(out)
  }
  return { seen, fetcher }
}

function memoryCredentials(): AtsCredentialStore {
  const map = new Map<ConnectableAts, AtsCredential>()
  return {
    get: (ats) => map.get(ats) ?? null,
    set: (c) => void map.set(c.ats, c),
    delete: (ats) => void map.delete(ats),
  }
}

async function setup(answer: (r: Request) => unknown = () => ({})) {
  const dir = mkdtempSync(join(tmpdir(), 'redrob-ats-'))
  dirs.push(dir)
  const { db } = openBrowserOsDatabase({ dbPath: join(dir, 'db.sqlite') })
  const store = new HiringStore(db, { saltPath: join(dir, 'salt') })
  const { role } = store.createRole({
    title: 'Backend Engineer',
    location: 'Seoul',
    criteria: [{ text: '5+ years', kind: 'must' }],
  })
  const { personId } = await store.upsertPerson(role.id, jiwon)
  const mock = mockFetch(answer)
  const ats = new HiringAts(store, memoryCredentials(), {
    fetch: mock.fetcher,
    receiptsDir: join(dir, 'receipts'),
  })
  setAtsSource(ats)
  return { store, ats, role, personId, ...mock, dir }
}

function call(
  tool: string,
  args: Record<string, unknown>,
  refs: Record<string, string> = {},
  conversationId = 'c1',
): BrowserToolCall {
  return {
    tool: { name: tool },
    args,
    lease: { conversationId },
    context: {
      session: {
        observe: () => ({
          lastRefs: new Map(
            Object.entries(refs).map(([k, v]) => [k, { name: v }]),
          ),
        }),
        screenshot: async () => ({
          data: Buffer.from('png').toString('base64'),
        }),
      },
    },
  } as unknown as BrowserToolCall
}

describe('ATS API clients', () => {
  it('Greenhouse Harvest v3: a client-credentials token, then a prospect and a note', async () => {
    const { seen, fetcher } = mockFetch((r) =>
      r.url.endsWith('/token')
        ? { access_token: 't1', expires_in: 3600 }
        : r.url.endsWith('/candidates')
          ? { id: 42 }
          : {},
    )
    const client = atsClient(
      { ats: 'greenhouse', clientId: 'id', clientSecret: 'secret' },
      { fetch: fetcher },
    )
    const id = await client.addProspect({
      name: 'Jiwon Kim',
      email: 'jiwon@example.com',
      profileUrl: jiwon.url,
    })
    await client.addNote(id, 'A note')
    expect(seen[0]).toMatchObject({
      url: 'https://auth.greenhouse.io/token',
      method: 'POST',
      auth: `Basic ${Buffer.from('id:secret').toString('base64')}`,
      body: 'grant_type=client_credentials',
    })
    expect(seen[1]?.url).toBe('https://harvest.greenhouse.io/v3/candidates')
    expect(JSON.parse(seen[1]?.body ?? '')).toMatchObject({
      first_name: 'Jiwon',
      last_name: 'Kim',
      application: { prospect: true },
    })
    expect(seen[2]).toMatchObject({
      url: 'https://harvest.greenhouse.io/v3/notes',
      auth: 'Bearer t1',
    })
    expect(JSON.parse(seen[2]?.body ?? '')).toEqual({
      candidate_id: 42,
      body: 'A note',
      note_type: 'NOTE',
      visibility: 'public',
    })
    // The token is reused while it lasts.
    expect(seen.filter((r) => r.url.endsWith('/token'))).toHaveLength(1)
  })

  it('Lever: the recruiter is found by email, and acts as themselves', async () => {
    const { seen, fetcher } = mockFetch((r) =>
      r.url.includes('/users?')
        ? { data: [{ id: 'u1' }] }
        : r.url.includes('/opportunities?email')
          ? { data: [] }
          : { data: { id: 'o1' } },
    )
    const client = atsClient(
      { ats: 'lever', key: 'k', email: 'me@company.com' },
      { fetch: fetcher },
    )
    const verified = await client.verify()
    expect(verified).toMatchObject({ userId: 'u1' })
    const lever = atsClient(verified, { fetch: fetcher })
    expect(
      await lever.find({
        name: 'J',
        email: 'jiwon@example.com',
        profileUrl: 'x',
      }),
    ).toBeNull()
    expect(
      await lever.addProspect({ name: 'Jiwon Kim', profileUrl: jiwon.url }),
    ).toBe('o1')
    await lever.addNote('o1', 'A note')
    expect(seen.at(-2)?.url).toBe(
      'https://api.lever.co/v1/opportunities?perform_as=u1',
    )
    expect(seen.at(-1)?.url).toBe(
      'https://api.lever.co/v1/opportunities/o1/notes?perform_as=u1',
    )
    expect(seen[0]?.auth).toBe(`Basic ${Buffer.from('k:').toString('base64')}`)
  })

  it('Ashby: found by email, and a bad key is said plainly', async () => {
    const { seen, fetcher } = mockFetch((r) =>
      r.url.endsWith('candidate.search')
        ? { success: true, results: [{ id: 'a1' }] }
        : { success: true, results: {} },
    )
    const client = atsClient({ ats: 'ashby', key: 'k' }, { fetch: fetcher })
    expect(
      await client.find({
        name: 'J',
        email: 'jiwon@example.com',
        profileUrl: 'x',
      }),
    ).toBe('a1')
    await client.addNote('a1', 'A note')
    expect(seen[1]?.url).toBe('https://api.ashbyhq.com/candidate.createNote')
    const bad = atsClient(
      { ats: 'ashby', key: 'k' },
      { fetch: async () => new Response('', { status: 401 }) },
    )
    await expect(bad.verify()).rejects.toMatchObject({ code: 'bad-key' })
  })
})

describe('Saving to the ATS', () => {
  it('only someone shortlisted; through the connection it adds them once and notes them', async () => {
    const { store, ats, role, personId, seen } = await setup((r) =>
      r.url.endsWith('apiKey.info') || r.url.endsWith('createNote')
        ? { success: true, results: {} }
        : r.url.endsWith('candidate.search')
          ? { success: true, results: [] }
          : { success: true, results: { id: 'a9' } },
    )
    await expect(
      ats.saveViaApi(role.id, personId, 'ashby', 'en'),
    ).resolves.toEqual({ status: 'needs-you', reason: 'not-connected' })
    await ats.connect({ ats: 'ashby', key: 'k' })
    expect(ats.connections().find((c) => c.ats === 'ashby')).toEqual({
      ats: 'ashby',
      connected: true,
    })
    await expect(
      ats.saveViaApi(role.id, personId, 'ashby', 'en'),
    ).rejects.toMatchObject({
      code: 'not-shortlisted',
    })
    store.setStage(role.id, personId, 'shortlisted', 'recruiter')
    expect(await ats.saveViaApi(role.id, personId, 'ashby', 'en')).toEqual({
      status: 'saved',
      ats: 'ashby',
      candidateId: 'a9',
      via: 'api',
    })
    expect(store.peopleOnRole(role.id)[0]?.stage).toBe('saved')
    const note = JSON.parse(
      seen.find((r) => r.url.endsWith('createNote'))?.body ?? '{}',
    )
    expect(note.note).toContain('Saved for Backend Engineer.')
    // A second save notes the same candidate rather than adding them again.
    const creates = () =>
      seen.filter((r) => r.url.endsWith('candidate.create')).length
    await ats.saveViaApi(role.id, personId, 'ashby', 'en')
    expect(creates()).toBe(1)
    expect(
      store.record(role.id).find((e) => e.kind === 'saved-to-ats')?.detail,
    ).toMatchObject({
      ats: 'ashby',
      via: 'api',
      candidateId: 'a9',
      added: true,
    })
  })

  it('in the browser: on the ATS host, the note word for word, never a reject, the chosen stage only, and a receipt', async () => {
    const { store, ats, role, personId, dir } = await setup()
    store.setStage(role.id, personId, 'shortlisted', 'recruiter')
    const { instruction } = ats.startBrowser(role.id, personId, {
      ats: 'greenhouse',
      conversationId: 'c1',
      locale: 'en',
      stage: 'Phone Screen',
    })
    expect(instruction).toContain('Never reject')
    const note = ats.activeRun('c1')?.note ?? ''
    expect(instruction).toContain(note)

    const refused = (c: BrowserToolCall) => guardHiringAts(c)?.isError === true
    expect(refused(call('navigate', { url: 'https://evil.example/' }))).toBe(
      true,
    )
    expect(
      refused(call('navigate', { url: 'https://app.greenhouse.io/people/1' })),
    ).toBe(false)
    expect(refused(call('run', { code: 'x' }))).toBe(true)
    expect(
      refused(
        call('act', {
          page: 1,
          kind: 'type',
          text: 'Strong candidate, move to offer immediately please.',
        }),
      ),
    ).toBe(true)
    expect(
      refused(call('act', { page: 1, kind: 'type', text: jiwon.url })),
    ).toBe(false)
    for (const name of ['Reject', 'Archive candidate', 'Disqualify', '불합격'])
      expect(
        refused(
          call('act', { page: 1, kind: 'click', ref: 'e1' }, { e1: name }),
        ),
      ).toBe(true)
    expect(
      refused(
        call(
          'act',
          { page: 1, kind: 'click', ref: 'e1' },
          { e1: 'Move Stage' },
        ),
      ),
    ).toBe(false)

    // Saving before the note is typed is not the note.
    const save = call(
      'act',
      { page: 1, kind: 'click', ref: 'e2' },
      { e2: 'Save' },
    )
    guardHiringAts(save)
    await applyHiringAts({ call: save, result: { content: [] }, durationMs: 1 })
    expect(ats.activeRun('c1')?.notePosted).toBe(false)

    const typing = call('act', { page: 1, kind: 'type', text: note })
    expect(guardHiringAts(typing)).toBeNull()
    guardHiringAts(save)
    await applyHiringAts({ call: save, result: { content: [] }, durationMs: 1 })
    expect(ats.activeRun('c1')?.notePosted).toBe(true)

    const stage = call(
      'act',
      { page: 1, kind: 'click', ref: 'e3' },
      { e3: 'Phone Screen' },
    )
    expect(guardHiringAts(stage)).toBeNull()
    await applyHiringAts({
      call: stage,
      result: { content: [] },
      durationMs: 1,
    })
    expect(guardHiringAts(stage)?.isError).toBe(true)

    expect(ats.end('c1')).toEqual({
      status: 'saved',
      ats: 'greenhouse',
      via: 'browser',
    })
    expect(store.peopleOnRole(role.id)[0]?.stage).toBe('saved')
    const detail = store
      .record(role.id)
      .find((e) => e.kind === 'saved-to-ats')?.detail
    expect(detail).toMatchObject({
      ats: 'greenhouse',
      via: 'browser',
      stage: 'Phone Screen',
      stageMoved: true,
    })
    expect(existsSync(join(dir, 'receipts', `${detail?.receipt}.png`))).toBe(
      true,
    )
    // Outside a run, nothing is guarded.
    expect(guardHiringAts(call('run', {}))).toBeNull()
  })

  it('with no stage chosen, a stage control is refused; a run that posts no note needs the recruiter', async () => {
    const { store, ats, role, personId } = await setup()
    store.setStage(role.id, personId, 'contacted', 'recruiter')
    ats.startBrowser(role.id, personId, {
      ats: 'workday',
      conversationId: 'c2',
      locale: 'ko',
    })
    expect(
      guardHiringAts(
        call(
          'act',
          { page: 1, kind: 'click', ref: 'e1' },
          { e1: 'Move Stage' },
          'c2',
        ),
      )?.isError,
    ).toBe(true)
    expect(ats.end('c2')).toEqual({ status: 'needs-you', reason: 'not-saved' })
    expect(store.peopleOnRole(role.id)[0]?.stage).toBe('contacted')
  })
})
