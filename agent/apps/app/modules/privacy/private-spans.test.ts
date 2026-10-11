/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'bun:test'
import { privateCount, privateKinds, splitPrivate } from './private-spans'

describe('splitPrivate', () => {
  it('marks what the AI saw as placeholders, keeping the person’s own words', () => {
    const text =
      'Send it to jiwon@example.com and jiwon@example.com, or 010-1234-5678.'
    const pieces = splitPrivate(text, 'standard')
    expect(pieces.map((piece) => piece.text).join('')).toBe(text)
    expect(
      pieces
        .filter((piece) => piece.kind === 'private')
        .map((piece) => piece.text),
    ).toEqual(['jiwon@example.com', 'jiwon@example.com', '010-1234-5678'])
    expect(privateCount(pieces)).toBe(2)
    expect(privateKinds(pieces)).toEqual(['EMAIL', 'PHONE'])
  })

  it('marks listed names from High up, and nothing when off', () => {
    const names = [['김지원', 'Jiwon Kim']]
    expect(privateCount(splitPrivate('김지원님께', 'standard', names))).toBe(0)
    const high = splitPrivate('김지원님께', 'high', names)
    expect(high[0]).toMatchObject({
      kind: 'private',
      text: '김지원',
      as: '[PERSON_1]',
    })
    expect(high[1]).toEqual({ kind: 'text', text: '님께' })
    expect(splitPrivate('jiwon@example.com', 'off')).toEqual([
      { kind: 'text', text: 'jiwon@example.com' },
    ])
  })

  it('leaves text that only looks like a label alone', () => {
    const text = 'The docs call it [EMAIL_1] but that is literal.'
    expect(privateCount(splitPrivate(text, 'standard'))).toBe(0)
    expect(
      splitPrivate(text, 'standard')
        .map((piece) => piece.text)
        .join(''),
    ).toBe(text)
  })
})
