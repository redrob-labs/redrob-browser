/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: MIT
 *
 * Ported from Redrob Cowork, apps/server/src/privacy/compute.test.ts (MIT).
 */

import { describe, expect, test } from 'bun:test'

import { ComputeError, compute } from '../src/compute'

const text = (expression: string) => compute(expression).text

describe('privacy_compute arithmetic', () => {
  test('amounts keep their currency, written the way it was', () => {
    expect(text('₩12,345,678 + ₩3,210,987')).toBe('₩15,556,665')
    expect(text('9,876,543원 - 1,000,000원')).toBe('8,876,543원')
    expect(text('USD 1,200.50 * 3')).toBe('USD 3,601.5')
    expect(text('$100 - $250')).toBe('-$150')
    expect(text('sum(₩1,000, ₩2,000, ₩3,500)')).toBe('₩6,500')
    expect(text('max(1,000원, 2,500원) - min(1,000원, 2,500원)')).toBe(
      '1,500원',
    )
  })

  test('percentages, ratios and rounding', () => {
    expect(text('₩12,000,000 * 3.5%')).toBe('₩420,000')
    expect(text('₩3,000,000 / ₩12,000,000')).toBe('0.25')
    expect(text('round(10 / 3, 2)')).toBe('3.33')
    expect(text('abs(-(2 + 3) * 4)')).toBe('20')
    expect(compute('1,234.5678').value).toBe(1234.5678)
  })

  test('days between dates, in ISO and Korean forms', () => {
    expect(text('days(2026-03-01, 2026-10-31)')).toBe('244')
    expect(text('days(2026년 1월 1일, 2026.12.31)')).toBe('364')
    expect(text('2026-10-31 - 2026-10-01')).toBe('30')
  })

  test('one comparison', () => {
    expect(compute('₩12,345,678 > ₩3,210,987')).toMatchObject({
      value: true,
      text: 'true',
    })
    expect(compute('1 + 1 == 3')).toMatchObject({ value: false })
  })

  test('refuses what it cannot do, and says where', () => {
    for (const [expression, message] of [
      ['₩1,000 + $1', /mixes currencies/],
      ['₩1,000 * ₩2', /multiply two amounts/],
      ['1 / 0', /division by zero/],
      ['2026-02-30 - 2026-02-01', /not a date/],
      ['2026-01-01 + 3', /cannot add dates/],
      ['process.exit(1)', /expected a number/],
      ['1 + ', /expected a number at the end/],
      ['(1 + 2', /missing \)/],
      ['1 2', /unexpected text at "2"/],
      ['', /empty/],
      ['1+'.repeat(1_500), /longer than/],
    ] as const) {
      expect(() => compute(expression)).toThrow(ComputeError)
      expect(() => compute(expression)).toThrow(message)
    }
  })
})
