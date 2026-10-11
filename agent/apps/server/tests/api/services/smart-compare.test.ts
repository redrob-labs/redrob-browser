/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import type { BrowserSession } from '@browseros/browser-core/core/session'
import { Hono } from 'hono'
import { createSmartCompareRoutes } from '../../../src/api/routes/smart-compare'
import { SmartCompare } from '../../../src/api/services/smart-compare'

const fixture = (name: string) =>
  gunzipSync(
    readFileSync(
      join(
        import.meta.dir,
        '../../../../../packages/shopping/tests/fixtures',
        `${name}.html.gz`,
      ),
    ),
  ).toString('utf8')

/** A browser that serves saved pages, and records what Smart Compare did with its tabs. */
function fakeBrowser(pages: Record<string, string>) {
  const log: string[] = []
  const open = new Map<number, string>()
  let next = 1
  const session = {
    pages: {
      newPage: async (url: string, opts: { background?: boolean }) => {
        log.push(`open ${new URL(url).hostname} background=${opts.background}`)
        open.set(next, url)
        return next++
      },
      getTabId: (pageId: number) => pageId + 100,
      refresh: async () => ({ isLoading: false }),
      getSession: async (pageId: number) => ({
        session: {
          Runtime: {
            evaluate: async () => {
              const url = open.get(pageId) ?? ''
              const key = Object.keys(pages).find((k) => url.includes(k))
              return { result: { value: { url, html: key ? pages[key] : '' } } }
            },
          },
        },
      }),
      close: async (pageId: number) => {
        log.push(`close ${pageId}`)
        open.delete(pageId)
      },
    },
    cdp: async (method: string, params: Record<string, unknown>) => {
      log.push(`${method} ${JSON.stringify(params)}`)
      return { group: { groupId: 'g1' } }
    },
  }
  return { session: session as unknown as BrowserSession, log, open }
}

const product = {
  title: 'Sony WH-1000XM5 Premium Noise Cancelling Wireless Headphones, Black',
  models: ['wh1000xm5'],
  price: { amount: 34990, currency: 'INR' },
  url: 'https://www.flipkart.com/sony/p/itmabc',
  source: 'store-page' as const,
}

describe('Smart Compare in the browser', () => {
  it('searches in background tabs, groups them collapsed, closes every one, and caches', async () => {
    const browser = fakeBrowser({ flipkart: fixture('flipkart') })
    const compare = new SmartCompare(browser.session)
    const result = await compare.compare(product, 'IN')
    expect(result.lowest?.listing.price).toEqual({
      amount: 19489,
      currency: 'INR',
    })
    expect(result.saving).toBe(15501)
    expect(browser.log[0]).toBe('open www.flipkart.com background=true')
    expect(browser.log).toContain(
      'Browser.createTabGroup {"tabIds":[101],"title":"Smart Compare"}',
    )
    expect(browser.log.some((l) => l.includes('"collapsed":true'))).toBe(true)
    expect(browser.open.size).toBe(0)

    const opened = browser.log.length
    const again = await compare.compare(
      { ...product, price: { amount: 20000, currency: 'INR' } },
      'IN',
    )
    expect(browser.log.length).toBe(opened)
    expect(again.saving).toBe(511)
    await compare.compare(product, 'IN', { fresh: true })
    expect(browser.log.length).toBeGreaterThan(opened)
  })

  it('a store that refuses is reported, and the tab is still closed', async () => {
    const browser = fakeBrowser({
      coupang: fixture('coupang'),
      naver: fixture('naver'),
    })
    const result = await new SmartCompare(browser.session).compare(
      product,
      'KR',
    )
    expect(result.stores.map((s) => s.outcome.status)).toEqual([
      'blocked',
      'sign-in',
    ])
    expect(browser.open.size).toBe(0)
  })

  it('the route validates the product and answers with the comparison', async () => {
    const browser = fakeBrowser({ flipkart: fixture('flipkart') })
    const app = new Hono().route(
      '/compare',
      createSmartCompareRoutes({ compare: new SmartCompare(browser.session) }),
    )
    const bad = await app.request('/compare', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ product: { title: '' }, region: 'XX' }),
    })
    expect(bad.status).toBe(400)
    const ok = await app.request('/compare', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ product, region: 'IN' }),
    })
    expect(ok.status).toBe(200)
    expect(
      ((await ok.json()) as { lowest: { store: string } }).lowest.store,
    ).toBe('flipkart')
  })
})
