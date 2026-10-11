/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'bun:test'
import type { Comparison } from '@browseros/shopping/compare'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SmartCompareCard } from './SmartCompareCard'
import { SmartCompareChip } from './SmartCompareChip'

const listing = (
  title: string,
  amount: number,
  match: 'same' | 'variant' = 'same',
) => ({
  title,
  url: `https://www.coupang.com/vp/products/${amount}`,
  productId: String(amount),
  price: { amount, currency: 'KRW' },
  match,
  confidence: 3 as const,
  reason: 'model' as const,
})

const result: Comparison = {
  region: 'KR',
  query: 'Sony WH-1000XM5',
  product: {
    title: 'Sony WH-1000XM5 Black',
    models: ['wh1000xm5'],
    price: { amount: 429000, currency: 'KRW' },
    url: 'https://shop.example/p',
    source: 'json-ld',
  },
  stores: [
    {
      store: 'coupang',
      name: 'Coupang',
      searchUrl: 'https://www.coupang.com/np/search?q=x',
      outcome: {
        status: 'ok',
        best: listing('Sony WH-1000XM5 블랙', 389000),
        variants: [listing('Sony WH-1000XM5 실버', 379000, 'variant')],
        checked: 12,
      },
    },
    {
      store: 'naver',
      name: 'Naver Shopping',
      searchUrl: 'https://search.shopping.naver.com/search/all?query=x',
      outcome: { status: 'sign-in' },
    },
  ],
  lowest: {
    store: 'coupang',
    listing: listing('Sony WH-1000XM5 블랙', 389000),
  },
  saving: 40000,
  checkedAt: Date.now(),
}

const render = (props: Partial<Parameters<typeof SmartCompareCard>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(SmartCompareCard, {
      result,
      region: 'KR',
      onRegionChange: () => {},
      onRefresh: () => {},
      ...props,
    }),
  )

describe('the Smart Compare card', () => {
  it('puts the lowest first, with the saving against this page', () => {
    const html = render()
    const text = html.replace(/<[^>]+>/g, '')
    expect(text).toContain('Lowest ₩389,000 at Coupang')
    expect(text).toContain('₩40,000 less than this page')
    expect(html).toContain('Same product: model number matches')
  })

  it('says a store that asked to sign in was not checked, and links to its own search', () => {
    const html = render()
    expect(html).toContain('Naver Shopping asked you to sign in. Not checked.')
    expect(html).toContain('Search on Naver Shopping')
    expect(html).toContain('Checked 1 of 2 stores')
  })

  it('shows a variant as similar, never as the lowest, and the region it searched', () => {
    const html = render()
    expect(html).toContain('Similar, not the same')
    expect(html).toContain('<option value="KR" selected="">Korea</option>')
  })

  it('says so when nothing matched', () => {
    const html = render({
      result: { ...result, lowest: undefined, saving: undefined },
    })
    expect(html).toContain('No listing of this exact product was found.')
  })
})

describe('the chip', () => {
  it('names the stores it would search, and says when it is searching', () => {
    const idle = renderToStaticMarkup(
      createElement(SmartCompareChip, { region: 'KR', onCompare: () => {} }),
    )
    expect(idle).toContain('Compare prices')
    expect(idle).toContain('Search Coupang or Naver Shopping for this product')
    const busy = renderToStaticMarkup(
      createElement(SmartCompareChip, {
        region: 'US',
        busy: true,
        onCompare: () => {},
      }),
    )
    expect(busy).toContain('Searching Amazon…')
  })
})
