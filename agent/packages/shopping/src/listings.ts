/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Listings on a store's search page, and how well each matches the product being compared.
 *
 * Deliberately not per-store CSS selectors: the stores rename their classes every few weeks. A listing
 * is found the way a person finds one, a link to a product page with a price near it: walk up from
 * each product link to the smallest box that also holds a price, and read the title from the link,
 * a heading or an image's alt text inside that box.
 */

import { type Price, parsePrice } from './price'
import { modelTokens, type ProductIdentity } from './product'
import type { Store } from './stores'

export interface Listing {
  title: string
  url: string
  price: Price
  /** The store's id for the product, from its URL: an ASIN, a Flipkart itm id, a Coupang number. */
  productId: string
}

/** "Same product", a "variant" (same model, another colour or bundle), or not the product. */
export type MatchKind = 'same' | 'variant' | 'different'

export interface MatchedListing extends Listing {
  match: MatchKind
  /** 0–3, the design system's Confidence bars. */
  confidence: 1 | 2 | 3
  reason: 'model' | 'gtin' | 'title' | 'none'
}

const MAX_DEPTH = 8

function priceIn(el: Element, store: Store): Price | null {
  // Amazon writes the full price once for screen readers; it is the cleanest text on the card.
  const offscreen = el.querySelector('.a-price .a-offscreen')
  if (offscreen?.textContent) {
    const price = parsePrice(offscreen.textContent, store.currency)
    if (price) return price
  }
  const text = el.textContent ?? ''
  const marked =
    /(₩|\$|₹|Rs\.?)\s?\d[\d,.]*|\d[\d,]*\s?원/.exec(text)?.[0] ?? null
  return marked ? parsePrice(marked, store.currency) : null
}

function titleIn(el: Element, link: Element): string {
  const candidates = [
    link.getAttribute('title'),
    link.getAttribute('aria-label'),
    el.querySelector('h2, h3, h4')?.textContent,
    link.textContent,
    el.querySelector('img[alt]')?.getAttribute('alt'),
  ]
  for (const candidate of candidates) {
    const clean = candidate?.replace(/\s+/g, ' ').trim()
    if (clean && clean.length >= 8 && !/^[\d₩$₹,.\s원]+$/.test(clean))
      return clean
  }
  return ''
}

export function extractListings(
  doc: Document,
  store: Store,
  baseUrl: string,
  limit = 20,
): Listing[] {
  const seen = new Set<string>()
  const out: Listing[] = []
  for (const link of doc.querySelectorAll('a[href]')) {
    const href = link.getAttribute('href') ?? ''
    const id = store.productLink.exec(href)
    const productId = id?.slice(1).find(Boolean)
    if (!productId || seen.has(productId)) continue
    let box: Element | null = link
    let price: Price | null = null
    for (let depth = 0; box && depth < MAX_DEPTH; depth += 1) {
      price = priceIn(box, store)
      if (price) break
      box = box.parentElement
    }
    if (!box || !price || price.currency !== store.currency) continue
    // Sponsored placements are real offers, but a box holding several products is a carousel.
    if (box.querySelectorAll('a[href]').length > 40) continue
    const title = titleIn(box, link)
    if (!title) continue
    seen.add(productId)
    let url: string
    try {
      url = new URL(href, baseUrl).toString()
    } catch {
      continue
    }
    out.push({ title, url, price, productId })
    if (out.length >= limit) break
  }
  return out
}

/** Words that make a listing something for the product rather than the product. */
const ACCESSORY =
  /\b(case|cover|cushion|ear ?pads?|replacement|skin|stand|holder|protector|strap|cable|charger|adapter|for sony|compatible with)\b|케이스|커버|이어패드|교체용|호환|거치대|보호|필름|파우치/i

/** Not new: a fair offer, never the lowest price for the product itself. */
const NOT_NEW =
  /\b(renewed|refurbished|used|pre-?owned|open box)\b|리퍼|중고|반품|전시/i

const COLOUR =
  /\b(black|white|silver|blue|midnight|pink|gray|grey|beige|green|red|gold)\b|블랙|화이트|실버|블루|핑크|그레이|베이지|그린|레드|골드/gi

function words(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length > 1),
  )
}

export function matchListing(
  identity: ProductIdentity,
  listing: Listing,
): MatchedListing {
  const listingModels = modelTokens(listing.title)
  const accessory =
    ACCESSORY.test(listing.title) && !ACCESSORY.test(identity.title)
  if (accessory) {
    return { ...listing, match: 'different', confidence: 3, reason: 'none' }
  }
  if (identity.models.length) {
    const shared = identity.models.some((model) =>
      listingModels.some((other) => other === model),
    )
    // A longer model in the listing (wh1000xm5 vs wh1000xm4) is a different product; a model that
    // only shares a prefix is not a match.
    if (!shared) {
      return { ...listing, match: 'different', confidence: 2, reason: 'none' }
    }
    const mine = new Set(
      (identity.title.match(COLOUR) ?? []).map((c) => c.toLowerCase()),
    )
    const theirs = (listing.title.match(COLOUR) ?? []).map((c) =>
      c.toLowerCase(),
    )
    const otherColour =
      mine.size > 0 && theirs.length > 0 && !theirs.some((c) => mine.has(c))
    const notNew = NOT_NEW.test(listing.title) && !NOT_NEW.test(identity.title)
    return otherColour || notNew
      ? { ...listing, match: 'variant', confidence: 2, reason: 'model' }
      : { ...listing, match: 'same', confidence: 3, reason: 'model' }
  }
  // No model number: how much of the title the listing repeats.
  const mine = words(identity.title)
  const theirs = words(listing.title)
  const overlap =
    [...mine].filter((word) => theirs.has(word)).length / Math.max(1, mine.size)
  if (overlap >= 0.75)
    return { ...listing, match: 'same', confidence: 2, reason: 'title' }
  if (overlap >= 0.5)
    return { ...listing, match: 'same', confidence: 1, reason: 'title' }
  return { ...listing, match: 'different', confidence: 1, reason: 'none' }
}

/** Why a search page held no listings: the store refused, asked to sign in, or simply had none. */
export function pageProblem(
  doc: Document,
  url: string,
): 'blocked' | 'sign-in' | null {
  const title = doc.title.toLowerCase()
  const body = (doc.body?.textContent ?? '').slice(0, 4000).toLowerCase()
  if (
    /access denied|robot check|captcha|are you a human|자동입력|보안문자/.test(
      `${title} ${body}`,
    )
  ) {
    return 'blocked'
  }
  if (
    /로그인|sign in|log in/.test(title) ||
    /nid\.naver\.com|\/ap\/signin|\/login/.test(url)
  ) {
    return 'sign-in'
  }
  return null
}
