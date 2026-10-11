/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The fixtures are real pages, rendered in Chromium on 11 October 2026 and stripped of scripts and
 * styles: an Amazon product page, Amazon and Flipkart searches for "Sony WH-1000XM5", Coupang's
 * refusal of a headless browser, and Naver's sign-in redirect.
 */

import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { parseHTML } from 'linkedom'
import {
  compareProduct,
  PageTimeoutError,
  readSearchPage,
} from '../src/compare'
import { matchListing } from '../src/listings'
import { parsePrice } from '../src/price'
import { detectProduct, modelTokens } from '../src/product'
import { regionForLocale, STORES, searchQuery, storesFor } from '../src/stores'

const fixture = (name: string) =>
  gunzipSync(
    readFileSync(join(import.meta.dir, 'fixtures', `${name}.html.gz`)),
  ).toString('utf8')
const store = (id: string) => {
  const found = STORES.find((s) => s.id === id)
  if (!found) throw new Error(id)
  return found
}
const PRODUCT_URL = 'https://www.amazon.com/dp/B09XS7JWHH'

function product() {
  const identity = detectProduct(
    parseHTML(fixture('amazon-product')).document,
    PRODUCT_URL,
  )
  if (!identity) throw new Error('no product')
  return identity
}

describe('reading the product a page is about', () => {
  it('reads a real Amazon product page: title, model, price', () => {
    const identity = product()
    expect(identity.title).toContain('Sony WH-1000XM5')
    expect(identity.models).toContain('wh1000xm5')
    expect(identity.price).toEqual({ amount: 269, currency: 'USD' })
    expect(searchQuery(identity)).toBe('Sony WH-1000XM5')
  })

  it('prefers schema.org JSON-LD, with GTIN and offer, and falls back to Open Graph', () => {
    const { document } = parseHTML(`<html><head>
      <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Product",
        "name":"삼성 갤럭시 버즈3 프로 SM-R630","brand":{"@type":"Brand","name":"Samsung"},"gtin13":"8806095603221",
        "offers":{"@type":"Offer","price":"329000","priceCurrency":"KRW"}}]}</script></head></html>`)
    expect(detectProduct(document, 'https://shop.example/p/1')).toMatchObject({
      brand: 'Samsung',
      gtin: '8806095603221',
      models: ['smr630'],
      price: { amount: 329000, currency: 'KRW' },
      source: 'json-ld',
    })
    const og =
      parseHTML(`<html><head><meta property="og:type" content="product">
      <meta property="og:title" content="Kindle Paperwhite 16GB"><meta property="product:price:amount" content="149.99">
      <meta property="product:price:currency" content="USD"></head></html>`).document
    expect(detectProduct(og, 'https://shop.example/k')).toMatchObject({
      source: 'open-graph',
      price: { amount: 149.99, currency: 'USD' },
    })
    expect(
      detectProduct(
        parseHTML('<html><body>news</body></html>').document,
        'https://news.example/',
      ),
    ).toBeNull()
  })

  it('finds model numbers however they are written, and not sizes or years', () => {
    expect(modelTokens('Sony WH-1000XM5 Black')).toEqual(['wh1000xm5'])
    expect(modelTokens('WH 1000XM5 by Sony')).toEqual(['wh1000xm5'])
    expect(modelTokens('Galaxy S24 Ultra 256GB (2024) SM-S928N')).toEqual([
      'sms928n',
    ])
  })
})

describe('reading search pages', () => {
  it('finds Amazon listings and keeps the cheapest new one of the same product', () => {
    const outcome = readSearchPage(product(), store('amazon'), {
      url: 'https://www.amazon.com/s?k=Sony+WH-1000XM5',
      html: fixture('amazon'),
    })
    expect(outcome.status).toBe('ok')
    if (outcome.status !== 'ok') return
    expect(outcome.checked).toBeGreaterThan(10)
    expect(outcome.best.title).toContain('WH-1000XM5')
    expect(outcome.best.title).not.toMatch(/renewed|refurbished/i)
    expect(outcome.best.price.currency).toBe('USD')
    expect(outcome.best.url).toStartWith('https://www.amazon.com/')
  })

  it('finds Flipkart listings in rupees', () => {
    const outcome = readSearchPage(product(), store('flipkart'), {
      url: 'https://www.flipkart.com/search?q=Sony+WH-1000XM5',
      html: fixture('flipkart'),
    })
    expect(outcome.status).toBe('ok')
    if (outcome.status !== 'ok') return
    expect(outcome.best.price).toEqual({ amount: 19489, currency: 'INR' })
    expect(outcome.best.title).toMatch(/WH-1000XM5/i)
  })

  it('says a store refused, or asked to sign in, instead of "no cheaper price"', () => {
    expect(
      readSearchPage(product(), store('coupang'), {
        url: 'https://www.coupang.com/np/search?q=x',
        html: fixture('coupang'),
      }).status,
    ).toBe('blocked')
    expect(
      readSearchPage(product(), store('naver'), {
        url: 'https://nid.naver.com/nidlogin.login',
        html: fixture('naver'),
      }).status,
    ).toBe('sign-in')
  })
})

describe('matching', () => {
  const identity = product()
  const listing = (title: string) => ({
    title,
    url: 'https://x/',
    productId: '1',
    price: { amount: 1, currency: 'USD' },
  })
  it('the same model is the same product; another model, an accessory or a case is not', () => {
    expect(
      matchListing(identity, listing('Sony WH1000XM5/B Wireless')).match,
    ).toBe('same')
    expect(
      matchListing(identity, listing('Sony WH-1000XM4 Wireless')).match,
    ).toBe('different')
    expect(
      matchListing(identity, listing('Case for Sony WH-1000XM5')).match,
    ).toBe('different')
    expect(
      matchListing(identity, listing('소니 WH-1000XM5 이어패드 교체용')).match,
    ).toBe('different')
  })
  it('another colour or a refurbished one is a variant, never the lowest price', () => {
    expect(
      matchListing(identity, listing('Sony WH-1000XM5, Silver')).match,
    ).toBe('variant')
    expect(
      matchListing(identity, listing('Sony WH-1000XM5 Black (Renewed)')).match,
    ).toBe('variant')
  })
})

describe('a comparison', () => {
  it('searches the region’s stores, picks the lowest, and reports the ones it could not check', async () => {
    const pages: Record<string, string> = { flipkart: fixture('flipkart') }
    const result = await compareProduct(
      { ...product(), price: { amount: 34990, currency: 'INR' } },
      'IN',
      async (url) => {
        const id = STORES.find((s) =>
          url.startsWith(s.searchUrl('').split('?')[0] ?? ''),
        )?.id
        return { url, html: (id && pages[id]) ?? '' }
      },
      { now: () => 1 },
    )
    expect(result.stores.map((s) => s.store)).toEqual(['flipkart'])
    expect(result.lowest?.listing.price.amount).toBe(19489)
    expect(result.saving).toBe(15501)

    const kr = await compareProduct(product(), 'KR', async (url) => {
      if (url.includes('coupang')) throw new PageTimeoutError('slow')
      return {
        url: 'https://nid.naver.com/nidlogin.login',
        html: fixture('naver'),
      }
    })
    expect(kr.stores.map((s) => [s.store, s.outcome.status])).toEqual([
      ['coupang', 'timeout'],
      ['naver', 'sign-in'],
    ])
    expect(kr.lowest).toBeUndefined()
  })

  it('regions come from the browser language', () => {
    expect(regionForLocale('ko')).toBe('KR')
    expect(regionForLocale('ko-KR')).toBe('KR')
    expect(regionForLocale('en-IN')).toBe('IN')
    expect(regionForLocale('hi')).toBe('IN')
    expect(regionForLocale('en-US')).toBe('US')
    expect(regionForLocale('ja')).toBe('US')
    expect(storesFor('KR').map((s) => s.id)).toEqual(['coupang', 'naver'])
  })

  it('reads prices the way each store writes them', () => {
    expect(parsePrice('₩389,000')).toEqual({ amount: 389000, currency: 'KRW' })
    expect(parsePrice('389,000원')).toEqual({ amount: 389000, currency: 'KRW' })
    expect(parsePrice('$1,299.99')).toEqual({
      amount: 1299.99,
      currency: 'USD',
    })
    expect(parsePrice('₹19,489')).toEqual({ amount: 19489, currency: 'INR' })
    expect(parsePrice('19,489', 'INR')).toEqual({
      amount: 19489,
      currency: 'INR',
    })
    expect(parsePrice('no price')).toBeNull()
  })
})
