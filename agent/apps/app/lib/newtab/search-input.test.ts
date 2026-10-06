/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'bun:test'
import { resolveSearchInput } from './search-input'

describe('resolveSearchInput', () => {
  it('ignores blank input', () => {
    expect(resolveSearchInput('   ')).toEqual({ kind: 'empty' })
  })

  it('searches for anything with a space', () => {
    expect(resolveSearchInput('react hooks guide')).toEqual({
      kind: 'search',
      text: 'react hooks guide',
    })
    expect(resolveSearchInput('example.com is down')).toEqual({
      kind: 'search',
      text: 'example.com is down',
    })
  })

  it('searches for a bare word', () => {
    expect(resolveSearchInput('weather')).toEqual({
      kind: 'search',
      text: 'weather',
    })
  })

  it('searches for a version-like token', () => {
    expect(resolveSearchInput('1.2')).toEqual({ kind: 'search', text: '1.2' })
  })

  it('opens a full url as given', () => {
    expect(resolveSearchInput('https://redrob.ai/pricing?x=1')).toEqual({
      kind: 'url',
      url: 'https://redrob.ai/pricing?x=1',
    })
    expect(resolveSearchInput('chrome://settings')).toEqual({
      kind: 'url',
      url: 'chrome://settings',
    })
  })

  it('adds https to a host', () => {
    expect(resolveSearchInput('redrob.ai')).toEqual({
      kind: 'url',
      url: 'https://redrob.ai/',
    })
    expect(resolveSearchInput('docs.redrob.ai/guide')).toEqual({
      kind: 'url',
      url: 'https://docs.redrob.ai/guide',
    })
  })

  it('uses http for local addresses', () => {
    expect(resolveSearchInput('localhost:3000')).toEqual({
      kind: 'url',
      url: 'http://localhost:3000/',
    })
    expect(resolveSearchInput('192.168.0.10:8080/admin')).toEqual({
      kind: 'url',
      url: 'http://192.168.0.10:8080/admin',
    })
  })

  it('does not open an unknown scheme', () => {
    expect(resolveSearchInput('javascript:alert(1)')).toEqual({
      kind: 'search',
      text: 'javascript:alert(1)',
    })
  })
})
