/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: MIT
 *
 * SECRET is the browser's addition to Cowork's categories.
 */

import { describe, expect, test } from 'bun:test'

import { emptyLabelMap, labelText, restoreText } from '../src/labels'

const STANDARD = { level: 'standard' as const, names: [] }

describe('secrets', () => {
  test('keys, tokens and private keys become labels from Standard up, and come back whole', () => {
    const map = emptyLabelMap()
    const text = [
      'OpenAI sk-proj-AbCdEfGhIjKlMnOpQrSt',
      'AWS AKIAIOSFODNN7EXAMPLE',
      'GitHub ghp_abcdefghijklmnopqrstuvwxyz0123',
      'Header: Bearer abc.def-ghi_jkl.mno',
      'jwt eyJhbGciOi.eyJzdWIiOiIx.SflKxwRJSM',
      '-----BEGIN PRIVATE KEY-----\nMIIEv\n-----END PRIVATE KEY-----',
    ].join('\n')
    const out = labelText(text, STANDARD, map)
    expect(out.found).toContain('SECRET')
    for (const secret of [
      'sk-proj-AbCdEfGhIjKlMnOpQrSt',
      'AKIAIOSFODNN7EXAMPLE',
      'ghp_abcdefghijklmnopqrstuvwxyz0123',
      'abc.def-ghi_jkl.mno',
      'eyJhbGciOi.eyJzdWIiOiIx.SflKxwRJSM',
      'MIIEv',
    ]) {
      expect(out.text).not.toContain(secret)
    }
    expect(out.text).toContain('Header: Bearer [SECRET_')
    expect(restoreText(out.text, map).text).toBe(text)
  })

  test('ordinary words that start like a key are left alone, and Off labels nothing', () => {
    const text = 'Ask the sk-team about pk-12 and the Bearer of news.'
    expect(labelText(text, STANDARD, emptyLabelMap()).text).toBe(text)
    const key = 'sk-proj-AbCdEfGhIjKlMnOpQrSt'
    expect(
      labelText(key, { level: 'off', names: [] }, emptyLabelMap()).text,
    ).toBe(key)
  })
})
