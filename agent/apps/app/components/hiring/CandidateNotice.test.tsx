/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { PersonOnRole, Role } from '@/modules/hiring/hiring.hooks'
import { CandidateNotice, noticeParts, noticeText } from './CandidateNotice'

const role = {
  id: 'r',
  title: 'Backend Engineer',
  location: 'Seoul',
  description: null,
  criteria: {
    version: 1,
    items: [
      { id: 'y', text: '5+ years', kind: 'must' },
      { id: 'l', text: 'Led a team', kind: 'nice', inferred: true },
    ],
  },
  mode: 'review',
  sites: [],
  createdAt: 0,
  updatedAt: 0,
} as Role

const person = {
  id: 'p',
  record: { name: 'Jiwon Kim' },
  evaluation: { results: [{ criterionId: 'y', state: 'met', by: 'device' }] },
} as unknown as PersonOnRole

describe('CandidateNotice', () => {
  it('says what was used and how it came out, what is never used, that a person decided, and the rights', () => {
    const parts = noticeParts(role, person)
    expect(parts.used).toEqual(['5+ years: Met'])
    expect(parts.notUsed).toContain('Your photo')
    const text = noticeText(parts)
    expect(text).toContain('Nothing here was decided automatically')
    expect(text).toContain('Never to be contacted again')
    // The notice is about them; it never needs their name.
    expect(text).not.toContain('Jiwon')
    const html = renderToStaticMarkup(
      createElement(CandidateNotice, { role, person }),
    )
    expect(html).toContain('rr-notice')
    expect(html).toContain('What it never looks at')
  })
})
