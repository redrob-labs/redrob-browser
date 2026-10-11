/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'
import { createPlaybookRoutes } from '../../../src/api/routes/playbooks'
import type { BrowserToolCall } from '../../../src/api/services/mcp/browser-tool-dispatch'
import { guardPlaybookStopsCall } from '../../../src/api/services/mcp/guards/playbook-stops'
import { PlaybookStore } from '../../../src/lib/playbooks/store'

const dirs: string[] = []
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() ?? '', { recursive: true, force: true })
})

function app() {
  const dir = mkdtempSync(join(tmpdir(), 'redrob-playbooks-'))
  dirs.push(dir)
  const store = new PlaybookStore(join(dir, 'playbooks'))
  return {
    store,
    dir,
    app: new Hono().route('/playbooks', createPlaybookRoutes({ store })),
  }
}

const json = (body: unknown, method = 'POST') => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

describe('playbook routes', () => {
  it('drafts from a recording, saves, lists, starts a run and deletes', async () => {
    const { app: a, store, dir } = app()
    const draft = await a.request(
      '/playbooks/draft',
      json({
        name: 'Weekly groceries',
        events: [
          {
            kind: 'navigate',
            url: 'https://www.amazon.com/fresh',
            title: 'Amazon Fresh',
            at: 0,
          },
          {
            kind: 'input',
            url: 'https://www.amazon.com/fresh',
            field: 'Search',
            value: 'oat milk',
            valueClass: 'text',
            at: 1,
          },
          // A recorder that misbehaves still cannot store a secret value.
          {
            kind: 'input',
            url: 'https://www.amazon.com/ap',
            field: 'Password',
            value: 'hunter2',
            valueClass: 'secret',
            at: 2,
          },
        ],
      }),
    )
    const { playbook } = (await draft.json()) as {
      playbook: { id: string; name: string }
    }
    expect(JSON.stringify(playbook)).not.toContain('hunter2')

    expect(
      (await a.request(`/playbooks/${playbook.id}`, json(playbook, 'PUT')))
        .status,
    ).toBe(200)
    const listed = (await (await a.request('/playbooks')).json()) as {
      playbooks: unknown[]
    }
    expect(listed.playbooks).toHaveLength(1)
    expect(
      statSync(join(dir, 'playbooks', `${playbook.id}.json`)).mode & 0o777,
    ).toBe(0o600)

    const run = await a.request(
      `/playbooks/${playbook.id}/runs`,
      json({ conversationId: 'c1', values: { search: 'eggs' } }),
    )
    expect(((await run.json()) as { message: string }).message).toContain(
      'Enter eggs into “Search”',
    )
    expect(store.activeRun('c1')?.sites).toEqual(['amazon.com'])
    expect(store.get(playbook.id)?.runs).toBe(1)

    expect(
      (await a.request(`/playbooks/${playbook.id}`, { method: 'DELETE' }))
        .status,
    ).toBe(204)
    expect(readdirSync(join(dir, 'playbooks'))).toEqual([])
  })

  it('refuses an invalid playbook', async () => {
    const { app: a } = app()
    const response = await a.request(
      '/playbooks/x1',
      json({ version: 1, name: '' }, 'PUT'),
    )
    expect(response.status).toBe(400)
  })
})

function call(
  tool: string,
  args: Record<string, unknown>,
  url: string,
  refName?: string,
): BrowserToolCall {
  return {
    tool: { name: tool },
    args,
    lease: { conversationId: 'c1' },
    context: {
      session: {
        pages: { getInfo: () => ({ url }) },
        observe: () => ({
          lastRefs: { get: () => (refName ? { name: refName } : undefined) },
        }),
      },
    },
  } as unknown as BrowserToolCall
}

describe('the playbook guard', () => {
  const run = {
    playbookId: 'p',
    name: 'Weekly groceries',
    sites: ['amazon.com'],
    expiresAt: Infinity,
  }

  it('stops before a final button, and lets ordinary clicks through', () => {
    const order = guardPlaybookStopsCall(
      call(
        'act',
        { page: 1, kind: 'click', ref: 'e1' },
        'https://www.amazon.com/checkout',
        'Place your order',
      ),
      run,
    )
    expect(order?.isError).toBe(true)
    expect(JSON.stringify(order)).toContain('they can press')
    expect(
      guardPlaybookStopsCall(
        call(
          'act',
          { page: 1, kind: 'click', ref: 'e2' },
          'https://www.amazon.com/s',
          'Add to cart',
        ),
        run,
      ),
    ).toBeNull()
  })

  it('keeps a run on its sites, and does nothing outside a run', () => {
    expect(
      guardPlaybookStopsCall(
        call(
          'act',
          { page: 1, kind: 'click', ref: 'e1' },
          'https://evil.example/',
          'Next',
        ),
        run,
      )?.isError,
    ).toBe(true)
    expect(
      guardPlaybookStopsCall(
        call('navigate', { url: 'https://evil.example/' }, ''),
        run,
      )?.isError,
    ).toBe(true)
    expect(
      guardPlaybookStopsCall(
        call(
          'act',
          { page: 1, kind: 'click', ref: 'e1' },
          'https://www.amazon.com/',
          'Place your order',
        ),
        null,
      ),
    ).toBeNull()
  })
})
