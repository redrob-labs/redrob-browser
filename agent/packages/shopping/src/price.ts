/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

export interface Price {
  amount: number
  currency: string
}

const SYMBOLS: Array<[RegExp, string]> = [
  [/₩|원|KRW/i, 'KRW'],
  [/₹|Rs\.?|INR/i, 'INR'],
  [/US\$|USD|\$/i, 'USD'],
  [/€|EUR/i, 'EUR'],
  [/£|GBP/i, 'GBP'],
  [/¥|JPY|円/i, 'JPY'],
]

/** Currencies written without decimals. */
const WHOLE = new Set(['KRW', 'JPY'])

/**
 * The first price in a string: `₩389,000`, `389,000원`, `$1,299.99`, `₹19,489`, `USD 12.50`.
 * `fallbackCurrency` is used when the string has a number and no currency mark.
 */
export function parsePrice(
  value: string,
  fallbackCurrency?: string,
): Price | null {
  const match =
    /(₩|\$|US\$|₹|Rs\.?|€|£|¥|USD|KRW|INR|EUR|GBP|JPY)?\s*(\d{1,3}(?:[,.\s]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(원|円|USD|KRW|INR)?/i.exec(
      value.replace(/\u00a0/g, ' '),
    )
  if (!match?.[2]) return null
  const mark = match[1] ?? match[3] ?? ''
  const currency =
    SYMBOLS.find(([pattern]) => pattern.test(mark))?.[1] ?? fallbackCurrency
  if (!currency) return null
  let digits = match[2].replace(/\s/g, '')
  if (WHOLE.has(currency)) {
    digits = digits.replace(/[.,]/g, '')
  } else if (/,\d{1,2}$/.test(digits) && !/\.\d/.test(digits)) {
    // 1.299,99 (a European decimal comma)
    digits = digits.replace(/\./g, '').replace(',', '.')
  } else {
    digits = digits.replace(/,/g, '')
  }
  const amount = Number(digits)
  return Number.isFinite(amount) && amount > 0 ? { amount, currency } : null
}
