/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Which stores Smart Compare searches, by region, and how to read a search page.
 *
 * Region comes from the browser's language: Korean is Korea (Coupang, Naver Shopping), any
 * `-IN` locale or Hindi is India (Flipkart), everything else the US (Amazon.com). The person can
 * override it; the card always names the region it searched.
 */

export type Region = 'KR' | 'IN' | 'US'

export interface Store {
  id: 'amazon' | 'flipkart' | 'coupang' | 'naver'
  name: string
  region: Region
  currency: string
  searchUrl: (query: string) => string
  /** A link to one product on a search page. */
  productLink: RegExp
}

export const STORES: readonly Store[] = [
  {
    id: 'amazon',
    name: 'Amazon',
    region: 'US',
    currency: 'USD',
    searchUrl: (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}`,
    productLink: /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/,
  },
  {
    id: 'flipkart',
    name: 'Flipkart',
    region: 'IN',
    currency: 'INR',
    searchUrl: (q) =>
      `https://www.flipkart.com/search?q=${encodeURIComponent(q)}`,
    productLink: /\/p\/(itm[a-z0-9]+)/,
  },
  {
    id: 'coupang',
    name: 'Coupang',
    region: 'KR',
    currency: 'KRW',
    searchUrl: (q) =>
      `https://www.coupang.com/np/search?q=${encodeURIComponent(q)}`,
    productLink: /\/vp\/products\/(\d+)/,
  },
  {
    id: 'naver',
    name: 'Naver Shopping',
    region: 'KR',
    currency: 'KRW',
    searchUrl: (q) =>
      `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(q)}`,
    productLink:
      /(?:\/catalog\/(\d+)|smartstore\.naver\.com\/[^/]+\/products\/(\d+)|\/products\/(\d+))/,
  },
]

export function regionForLocale(locale: string): Region {
  const lower = locale.toLowerCase()
  if (lower === 'ko' || lower.startsWith('ko-')) return 'KR'
  if (lower === 'hi' || lower.startsWith('hi-') || lower.endsWith('-in')) {
    return 'IN'
  }
  return 'US'
}

export function storesFor(region: Region): Store[] {
  return STORES.filter((store) => store.region === region)
}

/** What to type into a store's search box: brand and model number when known, else the title. */
export function searchQuery(identity: {
  title: string
  brand?: string
  models: string[]
}): string {
  const model = identity.models[0]
  if (model) {
    // The model as the title wrote it (WH-1000XM5), so the store's own search tokenises it.
    const found = new RegExp(model.split('').join('[- ]?'), 'i').exec(
      identity.title,
    )
    const written = found?.[0] ?? model
    // Without a brand from the page, the title's first word before the model usually is one.
    const lead = found
      ? identity.title.slice(0, found.index).trim().split(/\s+/)[0]
      : undefined
    const brand = identity.brand ?? lead
    return brand && !written.toLowerCase().includes(brand.toLowerCase())
      ? `${brand} ${written}`
      : written
  }
  return identity.title.split(/\s+/).slice(0, 8).join(' ')
}
