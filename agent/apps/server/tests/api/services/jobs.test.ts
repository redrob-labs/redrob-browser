/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'
import { createJobRoutes } from '../../../src/api/routes/jobs'
import type { BrowserToolCall } from '../../../src/api/services/mcp/browser-tool-dispatch'
import {
  applyJobReceipts,
  setJobReceiptStore,
} from '../../../src/api/services/mcp/effects/job-receipts'
import {
  guardJobApply,
  guardJobApplyCall,
  setApplicationRunSource,
} from '../../../src/api/services/mcp/guards/job-apply'
import { JobStore } from '../../../src/lib/jobs/store'

const dirs: string[] = []
afterEach(() => {
  setApplicationRunSource(() => null)
  setJobReceiptStore(null)
  while (dirs.length) rmSync(dirs.pop() ?? '', { recursive: true, force: true })
})

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'redrob-jobs-'))
  dirs.push(dir)
  const store = new JobStore(join(dir, 'jobs'))
  return {
    store,
    dir,
    app: new Hono().route('/jobs', createJobRoutes({ store })),
  }
}

const json = (body: unknown, method = 'POST') => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

const POSTING = {
  title: 'Senior Product Designer',
  company: 'Acme Inc.',
  location: 'Seoul (hybrid)',
  description: 'You will design with Figma. Hybrid, three days in Seoul.',
  url: 'https://boards.greenhouse.io/acme/jobs/1',
  source: 'json-ld' as const,
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
        screenshot: async () => ({
          data: Buffer.from('png').toString('base64'),
        }),
      },
    },
  } as unknown as BrowserToolCall
}

describe('job routes', () => {
  it('starts with the starter questions and saves a profile', async () => {
    const { app } = setup()
    const first = (await (await app.request('/jobs/profile')).json()) as {
      profile: { answers: Array<{ id: string }>; mode: string }
    }
    expect(first.profile.mode).toBe('review')
    expect(first.profile.answers.some((a) => a.id === 'notice')).toBe(true)
    const saved = await app.request(
      '/jobs/profile',
      json(
        {
          answers: [
            {
              id: 'notice',
              question: 'Notice period',
              aliases: [],
              answer: '1 month',
            },
          ],
          criteria: [
            { id: 'figma', text: 'Figma', kind: 'must', keywords: ['figma'] },
          ],
          mode: 'batch',
          dailyCap: 5,
          keywords: 'product designer',
        },
        'PUT',
      ),
    )
    expect(saved.status).toBe(200)
    const match = (await (
      await app.request('/jobs/match', json({ posting: POSTING }))
    ).json()) as { match: { qualifies: boolean } }
    expect(match.match.qualifies).toBe(true)
  })

  it('keeps the résumé as a private file and refuses other types', async () => {
    const { app, store } = setup()
    const bad = await app.request('/jobs/resume?name=run.sh', {
      method: 'POST',
      body: 'echo',
    })
    expect(bad.status).toBe(400)
    const ok = await app.request('/jobs/resume?name=../Jane%20CV.pdf', {
      method: 'POST',
      body: '%PDF-1.4',
    })
    expect(ok.status).toBe(200)
    const path = store.resumePath() ?? ''
    expect(path.endsWith(join('resume', '_Jane CV.pdf'))).toBe(true)
    expect(readFileSync(path, 'utf8')).toBe('%PDF-1.4')
    expect(statSync(path).mode & 0o777).toBe(0o600)
  })

  it('queues once per role, starts a run and returns the apply message', async () => {
    const { app, store } = setup()
    const created = await app.request(
      '/jobs/applications',
      json({ posting: POSTING }),
    )
    expect(created.status).toBe(201)
    const { application } = (await created.json()) as {
      application: { id: string }
    }
    const again = await app.request(
      '/jobs/applications',
      json({
        posting: {
          ...POSTING,
          company: 'Acme',
          url: 'https://linkedin.com/jobs/2',
        },
      }),
    )
    expect(again.status).toBe(409)
    const run = await app.request(
      `/jobs/applications/${application.id}/runs`,
      json({ conversationId: 'c1', mode: 'review' }),
    )
    const { message } = (await run.json()) as { message: string }
    expect(message).toContain('stop before the final submit button')
    expect(store.activeRun('c1')?.applicationId).toBe(application.id)
    expect(store.getApplication(application.id)?.status).toBe('filling')
  })
})

describe('job-apply guard and receipts', () => {
  async function running(mode: 'review' | 'automatic') {
    const { store } = setup()
    await store.saveResume('cv.pdf', new TextEncoder().encode('%PDF'))
    const queued = await store.queue(POSTING, false)
    if (!('application' in queued)) throw new Error('not queued')
    await store.startRun('c1', queued.application, mode)
    setApplicationRunSource((id) => store.activeRun(id))
    setJobReceiptStore(store)
    return { store, id: queued.application.id }
  }

  it('in review mode the submit button is the person’s', async () => {
    const { store } = await running('review')
    const press = call(
      'act',
      { page: 1, kind: 'click', ref: 'e9' },
      { e9: 'Submit application' },
    )
    expect(guardJobApply(press)?.isError).toBe(true)
    const next = call(
      'act',
      { page: 1, kind: 'click', ref: 'e3' },
      { e3: 'Next' },
    )
    expect(guardJobApply(next)).toBeNull()
    expect(guardJobApplyCall(press, null)).toBeNull()
    expect(store.activeRun('c1')).not.toBeNull()
  })

  it('uploads only the résumé', async () => {
    const { store } = await running('automatic')
    const path = store.resumePath() ?? ''
    expect(
      guardJobApply(call('upload', { page: 1, ref: 'e1', file: path })),
    ).toBeNull()
    expect(
      guardJobApply(
        call('upload', { page: 1, ref: 'e1', files: [path, '/etc/passwd'] }),
      )?.isError,
    ).toBe(true)
  })

  it('records the filled fields and keeps a receipt when it is sent', async () => {
    const { store, id } = await running('automatic')
    const fill = call(
      'act',
      { page: 1, kind: 'fill', fields: [{ ref: 'e2', value: '1 month' }] },
      { e2: 'Notice period' },
    )
    expect(guardJobApply(fill)).toBeNull()
    await applyJobReceipts({
      call: fill,
      result: { content: [] },
      durationMs: 1,
    })
    const send = call(
      'act',
      { page: 1, kind: 'click', ref: 'e9' },
      { e9: 'Submit application' },
    )
    expect(guardJobApply(send)).toBeNull()
    await applyJobReceipts({
      call: send,
      result: { content: [] },
      durationMs: 1,
    })
    const sent = store.getApplication(id)
    expect(sent?.status).toBe('sent')
    expect(sent?.receipt?.fields).toEqual([
      { field: 'Notice period', value: '1 month' },
    ])
    expect(sent?.receipt?.screenshot).toBe(`${id}.png`)
    expect(store.activeRun('c1')).toBeNull()
  })
})
