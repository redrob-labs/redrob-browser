/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * What product a page is about, read from the page itself: schema.org Product (JSON-LD), Open Graph
 * product tags, and small fallbacks for the four stores Smart Compare searches. No network, no model.
 *
 * `detectProduct` takes a Document so the content script and the tests run the same code.
 */

import { parsePrice } from './price'

export interface ProductIdentity {
  title: string
  brand?: string
  /** Model numbers seen in the title or the structured data, normalised: `wh1000xm5`. */
  models: string[]
  gtin?: string
  /** The page's own price, when it states one. */
  price?: { amount: number; currency: string }
  url: string
  /** Where the identity came from, for the card's "how sure" line. */
  source: 'json-ld' | 'open-graph' | 'store-page'
}

type Json = Record<string, unknown>

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value === undefined ? [] : [value]
}

function isType(node: Json, type: string): boolean {
  return asArray(node['@type']).some((t) => t === type)
}

/** Every JSON-LD object on the page, @graph members included. */
function jsonLd(doc: Document): Json[] {
  const out: Json[] = []
  for (const script of doc.querySelectorAll(
    'script[type="application/ld+json"]',
  )) {
    try {
      const walk = (value: unknown) => {
        for (const item of asArray(value)) {
          if (item && typeof item === 'object') {
            out.push(item as Json)
            walk((item as Json)['@graph'])
          }
        }
      }
      walk(JSON.parse(script.textContent ?? ''))
    } catch {
      // A page's broken JSON-LD is the page's problem; the other sources still apply.
    }
  }
  return out
}

function text(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined
  if (value && typeof value === 'object' && 'name' in value) {
    return text((value as Json).name)
  }
  return undefined
}

/**
 * Model numbers in a string, normalised: `WH-1000XM5`, `WH 1000XM5`, `wh1000xm5` → `wh1000xm5`.
 * A model is a word with letters and digits, 4+ characters, hyphens folded; a short letter prefix
 * written apart (`WH 1000XM5`, `SM G991B`) joins the word after it. A brand never does, so
 * "Sony WH-1000XM5" and "WH-1000XM5 by Sony" give the same token. Sizes and capacities alone
 * (`128GB`, `65inch`) and years are not models.
 */
export function modelTokens(value: string): string[] {
  const words = value.split(/[\s,/()|·]+/).filter(Boolean)
  const out = new Set<string>()
  const isModel = (candidate: string) =>
    candidate.length >= 4 &&
    /[a-z]/.test(candidate) &&
    /\d/.test(candidate) &&
    !/^\d+(gb|tb|mb|mm|cm|inch|in|hz|w|mah|ml|kg|g|l|p|k)$/.test(candidate) &&
    !/^(19|20)\d\d[a-z]?$/.test(candidate)
  for (let index = 0; index < words.length; index += 1) {
    const word = (words[index] ?? '').replace(/-/g, '').toLowerCase()
    const prefix = /^[a-z]{1,3}$/i.test(words[index - 1] ?? '')
      ? (words[index - 1] ?? '').toLowerCase()
      : ''
    if (prefix && /^\d/.test(word) && isModel(prefix + word))
      out.add(prefix + word)
    else if (isModel(word)) out.add(word)
  }
  return [...out]
}

function fromJsonLd(doc: Document, url: string): ProductIdentity | null {
  const product = jsonLd(doc).find((node) => isType(node, 'Product'))
  if (!product) return null
  const title = text(product.name)
  if (!title) return null
  const offer = asArray(product.offers).find(
    (o): o is Json => !!o && typeof o === 'object',
  )
  const amount = Number(offer?.price ?? offer?.lowPrice)
  const currency = text(offer?.priceCurrency)
  const models = modelTokens(
    [title, text(product.mpn), text(product.model), text(product.sku)]
      .filter(Boolean)
      .join(' '),
  )
  return {
    title,
    brand: text(product.brand),
    models,
    gtin: text(
      product.gtin13 ?? product.gtin12 ?? product.gtin14 ?? product.gtin,
    ),
    price:
      Number.isFinite(amount) && amount > 0 && currency
        ? { amount, currency }
        : undefined,
    url,
    source: 'json-ld',
  }
}

function meta(doc: Document, name: string): string | undefined {
  const node = doc.querySelector(
    `meta[property="${name}"], meta[name="${name}"]`,
  )
  return node?.getAttribute('content')?.trim() || undefined
}

function fromOpenGraph(doc: Document, url: string): ProductIdentity | null {
  const type = meta(doc, 'og:type')
  const amount = Number(
    meta(doc, 'product:price:amount') ?? meta(doc, 'og:price:amount'),
  )
  if (type !== 'product' && type !== 'og:product' && !Number.isFinite(amount)) {
    return null
  }
  const title = meta(doc, 'og:title')
  if (!title) return null
  const currency =
    meta(doc, 'product:price:currency') ?? meta(doc, 'og:price:currency')
  return {
    title,
    brand: meta(doc, 'product:brand'),
    models: modelTokens(title),
    price:
      Number.isFinite(amount) && amount > 0 && currency
        ? { amount, currency }
        : undefined,
    url,
    source: 'open-graph',
  }
}

/** The stores' own product pages, which often carry neither JSON-LD nor Open Graph prices. */
const STORE_PAGES: Array<{
  host: RegExp
  path: RegExp
  title: string
  price: string
  currency: string
  brand?: string
}> = [
  {
    host: /(^|\.)amazon\.(com|in|co\.uk|de|co\.jp)$/,
    path: /\/(dp|gp\/product)\/[A-Z0-9]{10}/,
    title: '#productTitle',
    price:
      '#corePrice_feature_div .a-price .a-offscreen, #corePriceDisplay_desktop_feature_div .a-price .a-offscreen, .a-price .a-offscreen',
    currency: '',
    brand: '#bylineInfo',
  },
  {
    host: /(^|\.)flipkart\.com$/,
    path: /\/p\/itm/,
    title: 'h1, span.VU-ZEz, span.B_NuCI',
    price: 'div.Nx9bqj, div._30jeq3',
    currency: 'INR',
  },
  {
    host: /(^|\.)coupang\.com$/,
    path: /\/vp\/products\//,
    title: 'h1.prod-buy-header__title, h2.prod-buy-header__title, h1',
    price: '.total-price strong, .prod-sale-price .total-price',
    currency: 'KRW',
  },
  {
    host: /(^|\.)(smartstore|brand)\.naver\.com$|(^|\.)shopping\.naver\.com$/,
    path: /\/(products|catalog)\//,
    title: 'h3, h2',
    price: 'strong span[class*="price"], span[class*="price_num"]',
    currency: 'KRW',
  },
]

function fromStorePage(doc: Document, url: string): ProductIdentity | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const store = STORE_PAGES.find(
    (s) => s.host.test(parsed.hostname) && s.path.test(parsed.pathname),
  )
  if (!store) return null
  const title = doc.querySelector(store.title)?.textContent?.trim()
  if (!title) return null
  const priceText = doc.querySelector(store.price)?.textContent ?? ''
  const price = parsePrice(priceText, store.currency || undefined)
  const brand = store.brand
    ? doc
        .querySelector(store.brand)
        ?.textContent?.replace(/^(Visit the|Brand:)\s*/i, '')
        .replace(/\s*Store$/i, '')
        .trim() || undefined
    : undefined
  return {
    title,
    brand,
    models: modelTokens(title),
    price: price ?? undefined,
    url,
    source: 'store-page',
  }
}

/** The page's product, or null when the page is not about one product. */
export function detectProduct(
  doc: Document,
  url: string,
): ProductIdentity | null {
  return (
    fromJsonLd(doc, url) ?? fromStorePage(doc, url) ?? fromOpenGraph(doc, url)
  )
}
