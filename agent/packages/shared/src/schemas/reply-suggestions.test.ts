/**
 * @license
 * Copyright 2026 Redrob
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, test } from 'bun:test'
import {
  normalizeSuggestedReplies,
  splitTrailingOptionsLine,
} from './reply-suggestions'

describe('normalizeSuggestedReplies', () => {
  test('trims, drops blanks and case-insensitive duplicates, caps at three', () => {
    expect(
      normalizeSuggestedReplies([
        '  Open it ',
        '',
        'open it',
        'Summarize',
        'Next page',
        'Fourth',
      ]),
    ).toEqual(['Open it', 'Summarize', 'Next page'])
  })
})

describe('splitTrailingOptionsLine', () => {
  test('strips a trailing options line and returns its replies', () => {
    const { text, replies } = splitTrailingOptionsLine(
      'Here are the results.\n\n[OPTIONS: Open the first | Summarize all | Search again]\n',
    )
    expect(text).toBe('Here are the results.')
    expect(replies).toEqual(['Open the first', 'Summarize all', 'Search again'])
  })

  test('leaves an options line quoted mid-answer alone', () => {
    const input = 'Write [OPTIONS: a | b] at the end.\nThen stop.'
    expect(splitTrailingOptionsLine(input)).toEqual({
      text: input,
      replies: [],
    })
  })

  test('returns the text unchanged when the line has no usable option', () => {
    const input = 'Done.\n[OPTIONS:  |  ]'
    expect(splitTrailingOptionsLine(input)).toEqual({
      text: input,
      replies: [],
    })
  })

  test('is case-insensitive on the keyword and tolerant of surrounding spaces', () => {
    const { text, replies } = splitTrailingOptionsLine(
      'Done.\n  [options: Yes | No ]  ',
    )
    expect(text).toBe('Done.')
    expect(replies).toEqual(['Yes', 'No'])
  })
})
