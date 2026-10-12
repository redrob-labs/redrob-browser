/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'bun:test'
import type { BrowserSession } from '@browseros/browser-core/core/session'
import {
  BackgroundReader,
  NeverReadSiteError,
  PageTimeoutError,
  ReadBudgetError,
} from '../../../src/api/services/background-reader'

/** A browser on a fake clock: records tabs and CDP calls, serves `body` for every page. */
function fake(options: { loading?: boolean; redirect?: string } = {}) {
  let clock = 1_000_000
  const log: string[] = []
  const open = new Map<number, string>()
  let next = 1
  const expressions: string[] = []
  const session = {
    pages: {
      newPage: async (url: string, o: { background?: boolean }) => {
        log.push(`open ${url} bg=${o.background} t=${clock}`)
        open.set(next, url)
        return next++
      },
      getTabId: (id: number) => id + 100,
      refresh: async () => ({ isLoading: options.loading === true }),
      getSession: async (id: number) => ({
        session: {
          Runtime: {
            evaluate: async ({ expression }: { expression: string }) => {
              expressions.push(expression)
              const url = options.redirect ?? open.get(id) ?? ''
              return {
                result: {
                  value: expression.includes('innerText')
                    ? { url, text: 'visible' }
                    : { url, html: '<html></html>' },
                },
              }
            },
          },
        },
      }),
      close: async (id: number) => {
        log.push(`close ${id}`)
        open.delete(id)
      },
    },
    cdp: async (method: string, params: Record<string, unknown>) => {
      log.push(`${method} ${JSON.stringify(params)}`)
      if (method === 'Browser.createTabGroup')
        return { group: { groupId: 'g1' } }
      return {}
    },
  }
  const reader = (neverRead?: (url: string) => boolean) =>
    new BackgroundReader(session as unknown as BrowserSession, {
      now: () => clock,
      sleep: async (ms) => {
        clock += Math.max(0, ms)
      },
      random: () => 0.5,
      neverRead,
    })
  return {
    reader,
    log,
    open,
    expressions,
    advance: (ms: number) => (clock += ms),
  }
}

describe('BackgroundReader', () => {
  it('reads in a collapsed named group and always closes the tab', async () => {
    const b = fake()
    const page = await b.reader().read('https://a.example/x', {
      group: 'Talent Scout · Backend',
      timeoutMs: 5_000,
      as: 'text',
    })
    expect(page).toEqual({ url: 'https://a.example/x', text: 'visible' })
    expect(b.expressions[0]).toContain('innerText')
    expect(b.log).toContain(
      'Browser.createTabGroup {"tabIds":[101],"title":"Talent Scout · Backend"}',
    )
    expect(b.log.some((l) => l.includes('"collapsed":true'))).toBe(true)
    expect(b.open.size).toBe(0)
  })

  it('refuses a site AI never reads before opening anything, and after a redirect to one', async () => {
    const b = fake()
    const never = (url: string) => new URL(url).hostname === 'hr.internal'
    await expect(
      b
        .reader(never)
        .read('https://hr.internal/p', { group: 'g', timeoutMs: 1 }),
    ).rejects.toBeInstanceOf(NeverReadSiteError)
    expect(b.log).toHaveLength(0)

    const hop = fake({ redirect: 'https://hr.internal/login' })
    await expect(
      hop
        .reader(never)
        .read('https://ok.example/', { group: 'g', timeoutMs: 1 }),
    ).rejects.toBeInstanceOf(NeverReadSiteError)
    expect(hop.open.size).toBe(0)
  })

  it('reads one page at a time per site, paced, and stops at the daily budget', async () => {
    const b = fake()
    const reader = b.reader()
    const pace = { minMs: 4_000, maxMs: 12_000, dailyBudget: 2 }
    const options = {
      group: 'g',
      timeoutMs: 5_000,
      site: 'linkedin',
      pace,
      settleMs: 0,
    }
    await Promise.all([
      reader.read('https://www.linkedin.com/in/a', options),
      reader.read('https://www.linkedin.com/in/b', options),
    ])
    const times = b.log
      .filter((l) => l.startsWith('open'))
      .map((l) => Number(l.split('t=')[1]))
    // The second waited the jittered gap (random 0.5 → 8 s) after the first finished.
    expect((times[1] ?? 0) - (times[0] ?? 0)).toBeGreaterThanOrEqual(8_000)
    expect(reader.remaining('linkedin', pace)).toBe(0)
    await expect(
      reader.read('https://www.linkedin.com/in/c', options),
    ).rejects.toBeInstanceOf(ReadBudgetError)
    // Another site is not held up by LinkedIn's pace or budget.
    await reader.read('https://github.com/c', { ...options, site: 'github' })
    // The next day the budget is back.
    b.advance(86_400_000)
    await reader.read('https://www.linkedin.com/in/d', options)
  })

  it('times out a page that never loads, and still closes it', async () => {
    const b = fake({ loading: true })
    await expect(
      b
        .reader()
        .read('https://slow.example/', { group: 'g', timeoutMs: 1_000 }),
    ).rejects.toBeInstanceOf(PageTimeoutError)
    expect(b.open.size).toBe(0)
  })
})
