/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: MIT
 *
 * Ported from Redrob Cowork, apps/server/src/privacy/privacy-gate.test.ts, the labels suite (MIT).
 */

import { describe, expect, test } from 'bun:test'

import {
  emptyLabelMap,
  labelText,
  type PrivacyRules,
  restoreDeep,
  restoreText,
  shiftDates,
} from '../src/labels'

const HIGH: PrivacyRules = {
  level: 'high',
  names: [['김지원', 'Jiwon Kim'], ['Acme Robotics']],
}

describe('labels', () => {
  test('a legal clause goes out with no identifiers and comes back whole; amounts and dates stay', () => {
    const map = emptyLabelMap()
    const clause =
      '제3조 (지급) 김지원님은 2026년 10월 31일까지 Acme Robotics에 ₩12,500,000을 국민은행 계좌 123-456-789012로 지급한다. 연락처: 010-1234-5678, jiwon@example.com'
    const out = labelText(clause, HIGH, map)
    for (const secret of [
      '김지원',
      'Acme Robotics',
      '123-456-789012',
      '010-1234-5678',
      'jiwon@example.com',
    ]) {
      expect(out.text).not.toContain(secret)
    }
    expect(out.text).toContain('[PERSON_1]님은')
    expect(out.text).toContain('[ORG_1]에')
    expect(out.text).toContain('₩12,500,000')
    expect(out.text).toContain('2026년 10월 31일')
    expect(out.text).toContain('제3조')
    expect(restoreText(out.text, map).text).toBe(clause)
  })

  test('every form of a person shares one label, across texts in the same chat', () => {
    const map = emptyLabelMap()
    const a = labelText(
      '김지원 signed. Later Jiwon Kim confirmed, and jiwon  kim paid.',
      HIGH,
      map,
    ).text
    const b = labelText('김지원님께 보냈습니다.', HIGH, map).text
    expect(a).toBe(
      '[PERSON_1] signed. Later [PERSON_1] confirmed, and [PERSON_1] paid.',
    )
    expect(b).toBe('[PERSON_1]님께 보냈습니다.')
    // A Latin form must be a whole word.
    expect(labelText('Kimchi and Jiwon Kimberly', HIGH, map).text).toBe(
      'Kimchi and Jiwon Kimberly',
    )
  })

  test('a financial statement keeps its figures; identifiers become labels', () => {
    const map = emptyLabelMap()
    const statement =
      'Revenue 4,210,000,000원 (+12.5%). Payable to Acme Robotics, BRN 220-81-62517, card 4111 1111 1111 1111.'
    const out = labelText(statement, HIGH, map).text
    expect(out).toContain('4,210,000,000원 (+12.5%)')
    expect(out).toMatch(/\[ORG_1\]/)
    expect(out).toMatch(/\[BRN_1\]/)
    expect(out).toMatch(/\[CARD_1\]/)
  })

  test('the levels: off does nothing, standard leaves names, strict labels titles next to names', () => {
    const text = '대표 김지원 (jiwon@example.com)'
    expect(
      labelText(text, { ...HIGH, level: 'off' }, emptyLabelMap()).text,
    ).toBe(text)
    expect(
      labelText(text, { ...HIGH, level: 'standard' }, emptyLabelMap()).text,
    ).toBe('대표 김지원 ([EMAIL_1])')
    expect(
      labelText(
        text,
        { ...HIGH, level: 'strict', transforms: { titlesNearNames: true } },
        emptyLabelMap(),
      ).text,
    ).toBe('[TITLE_1] [PERSON_1] ([EMAIL_1])')
  })

  test('restore tolerates garbled labels and reports the ones this chat never made', () => {
    const map = emptyLabelMap()
    labelText('김지원', HIGH, map)
    const result = restoreText(
      '[PERSON 1], PERSON_1, ［PERSON_1］ and [NAME_1] but not [PERSON_7]',
      map,
    )
    expect(result.text).toBe(
      '김지원, 김지원, 김지원 and 김지원 but not [PERSON_7]',
    )
    expect(result.unmapped).toEqual(['[PERSON_7]'])
    expect(restoreDeep({ to: ['[PERSON_1]'], n: 3 }, map)).toEqual({
      to: ['김지원'],
      n: 3,
    })
  })

  test("the policy's transforms: amounts rounded behind labels, dates moved by the chat's fixed offset and back", () => {
    const rules: PrivacyRules = {
      level: 'high',
      names: [],
      transforms: { roundAmounts: true, shiftDates: true },
    }
    const map = emptyLabelMap(10)
    const text =
      'Due 2026-10-31 and 2026년 11월 3일: ₩12,345,678 and 9,876,543원'
    const out = labelText(text, rules, map).text
    expect(out).toBe(
      'Due 2026-11-10 and 2026년 11월 13일: [AMOUNT_1](≈₩12,000,000) and [AMOUNT_2](≈9,900,000원)',
    )
    // The exact figures come back, with or without the approximation the model may repeat.
    expect(restoreText(out, map).text).toBe(text)
    expect(
      restoreText('[AMOUNT_1] vs [AMOUNT_2] (≈9,900,000원)', map).text,
    ).toBe('₩12,345,678 vs 9,876,543원')
    // The same amount keeps its label, and a labelled amount is never rounded twice.
    expect(labelText('again ₩12,345,678', rules, map).text).toBe(
      'again [AMOUNT_1](≈₩12,000,000)',
    )
    expect(labelText(out, rules, emptyLabelMap(10)).text).toContain(
      '[AMOUNT_1](≈₩12,000,000)',
    )
    // The gap between the dates is unchanged, and a restore moves them back.
    expect(restoreText('2026-11-10', map).text).toBe('2026-10-31')
    expect(shiftDates('2026-02-27', 2)).toBe('2026-03-01')
  })
})
