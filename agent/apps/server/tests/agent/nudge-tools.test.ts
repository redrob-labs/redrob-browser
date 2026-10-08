/**
 * @license
 * Copyright 2026 Redrob
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'bun:test'
import { buildNudgeToolSet } from '../../src/agent/nudge-tools'

type Sentinel = { content: { type: string; text?: string }[]; isError: boolean }

describe('suggest_replies', () => {
  const tools = buildNudgeToolSet()
  const suggestReplies = tools.suggest_replies as {
    execute: (args: { replies: string[] }, opts: unknown) => Promise<Sentinel>
    inputSchema: { safeParse: (v: unknown) => { success: boolean } }
  }

  it('returns a reply_suggestions sentinel the UI can intercept', async () => {
    const out = await suggestReplies.execute(
      { replies: [' Open the first ', 'Summarize all', 'summarize all'] },
      {},
    )
    expect(out.isError).toBe(false)
    expect(JSON.parse(out.content[0]?.text ?? '')).toEqual({
      type: 'reply_suggestions',
      replies: ['Open the first', 'Summarize all'],
    })
  })

  it('refuses more than three replies and an empty list', () => {
    expect(
      suggestReplies.inputSchema.safeParse({ replies: ['a', 'b', 'c', 'd'] })
        .success,
    ).toBe(false)
    expect(suggestReplies.inputSchema.safeParse({ replies: [] }).success).toBe(
      false,
    )
    expect(
      suggestReplies.inputSchema.safeParse({ replies: ['a', 'b', 'c'] })
        .success,
    ).toBe(true)
  })
})
