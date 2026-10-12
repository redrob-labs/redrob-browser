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
import {
  HiringOutreach,
  OutreachRefusedError,
} from '../../../src/api/services/hiring-outreach'
import type { BrowserToolCall } from '../../../src/api/services/mcp/browser-tool-dispatch'
import {
  applyHiringSend,
  guardHiringSend,
  recordHiringPress,
  setOutreachSource,
} from '../../../src/api/services/mcp/guards/hiring-send'
import { openBrowserOsDatabase } from '../../../src/lib/db/client'
import { HiringStore } from '../../../src/lib/hiring/store'

const dirs: string[] = []
afterEach(() => {
  setOutreachSource(null)
  while (dirs.length) rmSync(dirs.pop() ?? '', { recursive: true, force: true })
})

const NOTICE =
  'How I found you: your LinkedIn profile. Reply "no thanks" and I won’t write again.'

const jiwon: Candidate = {
  url: 'https://www.linkedin.com/in/jiwon',
  site: 'linkedin',
  name: 'Jiwon Kim',
  about: 'I build payment systems in Go.',
  positions: [{ title: 'Engineer', start: '2017-01', current: true }],
  education: [],
  skills: ['Go'],
  location: 'Seoul',
  languages: [],
  links: [],
  contact: [{ kind: 'email', value: 'jiwon@example.com' }],
}

/** 11:00 on a Monday in Seoul. */
const START = Date.UTC(2026, 9, 12, 2)

async function setup(
  options: {
    mode?: 'review' | 'automatic'
    location?: string
    model?: (u: string) => string
  } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), 'redrob-outreach-'))
  dirs.push(dir)
  let clock = START
  const { db } = openBrowserOsDatabase({ dbPath: join(dir, 'db.sqlite') })
  const store = new HiringStore(db, {
    now: () => clock,
    saltPath: join(dir, 'salt'),
  })
  const seen: string[] = []
  const gate = {
    // A stand-in for the gate that labels the one detail this test cares about.
    label: async (_k: string, texts: string[], o?: { minLevel?: string }) => {
      seen.push(`minLevel=${o?.minLevel}`)
      return {
        texts: texts.map((t) => t.replaceAll('Jiwon Kim', '[PERSON_1]')),
        found: [],
        newDetails: 0,
        detection: 'patterns' as const,
      }
    },
    restore: (_k: string, t: string) => t.replaceAll('[PERSON_1]', 'Jiwon Kim'),
    forget: () => {},
  }
  const outreach = new HiringOutreach(
    store,
    gate,
    options.model
      ? async (_s, user) => {
          seen.push(user)
          return options.model?.(user) ?? ''
        }
      : null,
    { now: () => clock, timeZone: 'Asia/Seoul' },
  )
  const { role } = store.createRole({
    title: 'Backend Engineer',
    location: options.location ?? 'Seoul',
    mode: options.mode ?? 'review',
    criteria: [{ text: '5+ years', kind: 'must' }],
  })
  const { personId } = await store.upsertPerson(role.id, jiwon)
  const { evaluate } = await import('@browseros/hiring/evaluate')
  const { activeCriteria } = await import('@browseros/hiring/criteria')
  const fresh = store.getRole(role.id)
  if (!fresh) throw new Error('role')
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
  setOutreachSource(outreach)
  return {
    store,
    outreach,
    role,
    personId,
    seen,
    advance: (ms: number) => (clock += ms),
  }
}

function call(
  tool: string,
  args: Record<string, unknown>,
  refs: Record<string, string> = {},
): BrowserToolCall {
  return {
    tool: { name: tool },
    args,
    lease: { conversationId: 'c1' },
    context: {
      session: {
        observe: () => ({
          lastRefs: new Map(
            Object.entries(refs).map(([k, v]) => [k, { name: v }]),
          ),
        }),
      },
    },
  } as unknown as BrowserToolCall
}

describe('Talent Scout outreach', () => {
  it('drafts behind the gate at High, restores the name, and adds how they were found', async () => {
    const { outreach, role, personId, seen } = await setup({
      model: (u) =>
        u.includes('[PERSON_1]')
          ? 'Hi [PERSON_1], your payments work stood out.'
          : 'leaked',
    })
    const out = await outreach.draft(role.id, personId, {
      notice: NOTICE,
      language: 'en',
    })
    if (out.status !== 'drafted') throw new Error(out.status)
    expect(seen[0]).toBe('minLevel=high')
    expect(seen[1]).not.toContain('Jiwon Kim')
    expect(out.message.body).toBe(
      `Hi Jiwon Kim, your payments work stood out.\n\n${NOTICE}`,
    )
    expect(out.message.status).toBe('draft')
  })

  it('without a model asks the recruiter to write it; their own text is used as written', async () => {
    const { outreach, role, personId } = await setup()
    expect(
      await outreach.draft(role.id, personId, {
        notice: NOTICE,
        language: 'en',
      }),
    ).toEqual({
      status: 'needs-you',
      reason: 'no-model',
    })
    const own = await outreach.draft(role.id, personId, {
      notice: NOTICE,
      language: 'en',
      body: 'Hi Jiwon',
    })
    expect(own.status === 'drafted' && own.message.body).toBe(
      `Hi Jiwon\n\n${NOTICE}`,
    )
  })

  it('Automatic approves only someone who meets every must have, and never in New York', async () => {
    const auto = await setup({ mode: 'automatic' })
    const a = await auto.outreach.draft(auto.role.id, auto.personId, {
      notice: NOTICE,
      language: 'en',
      body: 'Hi',
    })
    expect(
      a.status === 'drafted' && [a.message.status, a.message.approvedBy],
    ).toEqual(['approved', 'redrob:automatic'])
    const nyc = await setup({ mode: 'automatic', location: 'New York, NY' })
    const b = await nyc.outreach.draft(nyc.role.id, nyc.personId, {
      notice: NOTICE,
      language: 'en',
      body: 'Hi',
    })
    expect(b.status === 'drafted' && b.message.status).toBe('draft')
  })

  it('sends one approved message per run, held to its text and site, and keeps the receipt', async () => {
    const { outreach, store, role, personId } = await setup()
    const d = await outreach.draft(role.id, personId, {
      notice: NOTICE,
      language: 'en',
      body: 'Hi Jiwon, we are hiring a Backend Engineer in Seoul.',
    })
    if (d.status !== 'drafted') throw new Error()
    await expect(outreach.start(d.message.id, 'c1')).rejects.toBeInstanceOf(
      OutreachRefusedError,
    )
    outreach.approve([d.message.id])
    const { instruction } = await outreach.start(d.message.id, 'c1')
    expect(instruction).toContain('https://www.linkedin.com/in/jiwon')
    expect(instruction).toContain(d.message.body)

    expect(
      guardHiringSend(call('navigate', { url: 'https://evil.example/' }))
        ?.isError,
    ).toBe(true)
    expect(
      guardHiringSend(
        call('navigate', { url: 'https://www.linkedin.com/messaging/' }),
      ),
    ).toBeNull()
    expect(
      guardHiringSend(
        call('act', {
          page: 1,
          kind: 'type',
          text: 'Hi Jiwon, click https://evil.example to claim your offer now.',
        }),
      )?.isError,
    ).toBe(true)
    expect(
      guardHiringSend(
        call('act', { page: 1, kind: 'type', text: d.message.body }),
      ),
    ).toBeNull()
    expect(
      guardHiringSend(
        call(
          'act',
          { page: 1, kind: 'click', ref: 'e1' },
          { e1: 'Buy InMail credits' },
        ),
      )?.isError,
    ).toBe(true)
    expect(guardHiringSend(call('run', { code: 'x' }))?.isError).toBe(true)

    const send = call(
      'act',
      { page: 1, kind: 'click', ref: 'e2' },
      { e2: 'Send' },
    )
    expect(guardHiringSend(send)).toBeNull()
    recordHiringPress(send)
    await applyHiringSend({
      call: send,
      result: { content: [] },
      durationMs: 1,
    })
    expect(outreach.get(d.message.id)?.status).toBe('sent')
    expect(guardHiringSend(send)?.isError).toBe(true)
    expect(store.peopleOnRole(role.id)[0]?.stage).toBe('contacted')
    expect(
      store.record(role.id).find((e) => e.kind === 'contacted')?.detail,
    ).toMatchObject({ text: d.message.body })
  })

  it('refuses before a run: quiet hours, the 90-day window, and someone who opted out', async () => {
    const { outreach, role, personId, advance } = await setup()
    const first = await outreach.draft(role.id, personId, {
      notice: NOTICE,
      language: 'en',
      body: 'Hi',
    })
    if (first.status !== 'drafted') throw new Error()
    outreach.approve([first.message.id])
    advance(11 * 3_600_000) // 22:00 in Seoul
    await expect(outreach.start(first.message.id, 'c1')).rejects.toMatchObject({
      code: 'quiet-hours',
    })
    advance(11 * 3_600_000) // 09:00 next day
    await outreach.start(first.message.id, 'c1')
    outreach.markSent('c1')
    const again = await outreach.draft(role.id, personId, {
      notice: NOTICE,
      language: 'en',
      body: 'Hi again',
    })
    if (again.status !== 'drafted') throw new Error()
    outreach.approve([again.message.id])
    await expect(outreach.start(again.message.id, 'c2')).rejects.toMatchObject({
      code: 'contacted-recently',
    })
  })

  it('an opt-out reply stops every queued message and suppresses the person; another reply stops follow-ups', async () => {
    const { outreach, store, role, personId } = await setup()
    const m = await outreach.draft(role.id, personId, {
      notice: NOTICE,
      language: 'en',
      body: 'Hi',
    })
    if (m.status !== 'drafted') throw new Error()
    expect(await outreach.reply(role.id, personId, '연락하지 마세요')).toEqual({
      optedOut: true,
    })
    expect(outreach.get(m.message.id)?.status).toBe('stopped')
    expect(await store.isSuppressed(jiwon)).toBe(true)

    const other = await setup()
    await other.outreach.reply(
      other.role.id,
      other.personId,
      'Sounds good, Tuesday works',
    )
    expect(other.store.peopleOnRole(other.role.id)[0]?.stage).toBe('replied')
  })

  it('a run that ends without sending leaves the message approved, needing the recruiter', async () => {
    const { outreach, role, personId } = await setup()
    const m = await outreach.draft(role.id, personId, {
      notice: NOTICE,
      language: 'en',
      body: 'Hi',
    })
    if (m.status !== 'drafted') throw new Error()
    outreach.approve([m.message.id])
    await outreach.start(m.message.id, 'c1')
    expect(outreach.end('c1')).toMatchObject({
      status: 'approved',
      note: 'needs-you',
    })
    expect(guardHiringSend(call('run', {}))).toBeNull()
  })
})
