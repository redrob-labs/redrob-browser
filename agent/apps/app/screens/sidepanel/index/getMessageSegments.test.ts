/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { describe, expect, test } from 'bun:test'
import type { UIMessage } from 'ai'
import { getMessageSegments } from './getMessageSegments'

describe('getMessageSegments', () => {
  test('keeps provider-executed tool parts regardless of call id prefix', () => {
    const message = {
      id: 'message-1',
      role: 'assistant',
      parts: [
        {
          type: 'dynamic-tool',
          toolCallId: 'acpx-call-1',
          toolName: 'browser_navigate',
          state: 'output-available',
          input: { url: 'https://example.com' },
          output: { title: 'Example' },
        },
      ],
    } as unknown as UIMessage

    expect(getMessageSegments(message, true, false)).toEqual([
      {
        type: 'tool-batch',
        key: 'message-1-tools-acpx-call-1',
        tools: [
          {
            state: 'output-available',
            toolCallId: 'acpx-call-1',
            toolName: 'browser_navigate',
            input: { url: 'https://example.com' },
            output: { title: 'Example' },
            approval: undefined,
          },
        ],
      },
    ])
  })

  test('turns a suggest_replies tool result into one reply-suggestions segment', () => {
    const message = {
      id: 'm2',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Found three articles.' },
        {
          type: 'tool-suggest_replies',
          toolCallId: 'c1',
          state: 'output-available',
          input: { replies: ['Open the first', 'Summarize all'] },
          output: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  type: 'reply_suggestions',
                  replies: ['Open the first', 'Summarize all'],
                }),
              },
            ],
            isError: false,
          },
        },
      ],
    } as unknown as UIMessage

    expect(getMessageSegments(message, true, false)).toEqual([
      { type: 'text', key: 'm2-text-0', text: 'Found three articles.' },
      {
        type: 'reply-suggestions',
        key: 'm2-replies',
        replies: ['Open the first', 'Summarize all'],
      },
    ])
  })

  test('strips a trailing [OPTIONS:] line from the final text and renders it as chips', () => {
    const message = {
      id: 'm3',
      role: 'assistant',
      parts: [
        {
          type: 'text',
          text: 'Done.\n\n[OPTIONS: Open it | Summarize | Search again]',
        },
      ],
    } as unknown as UIMessage

    expect(getMessageSegments(message, true, false)).toEqual([
      { type: 'text', key: 'm3-text-0', text: 'Done.' },
      {
        type: 'reply-suggestions',
        key: 'm3-replies',
        replies: ['Open it', 'Summarize', 'Search again'],
      },
    ])
  })

  test('does not split the options line while the last message is still streaming', () => {
    const message = {
      id: 'm4',
      role: 'assistant',
      parts: [{ type: 'text', text: 'Done.\n[OPTIONS: Open it | Summarize]' }],
    } as unknown as UIMessage

    expect(getMessageSegments(message, true, true)).toEqual([
      {
        type: 'text',
        key: 'm4-text-0',
        text: 'Done.\n[OPTIONS: Open it | Summarize]',
      },
    ])
  })

  test('never reads options out of a user message', () => {
    const message = {
      id: 'm5',
      role: 'user',
      parts: [{ type: 'text', text: 'hi\n[OPTIONS: a | b]' }],
    } as unknown as UIMessage

    expect(getMessageSegments(message, false, false)).toEqual([
      { type: 'text', key: 'm5-text-0', text: 'hi\n[OPTIONS: a | b]' },
    ])
  })

  test('a pending suggest_replies call is not shown as a tool step', () => {
    const message = {
      id: 'm6',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Done.' },
        {
          type: 'tool-suggest_replies',
          toolCallId: 'c2',
          state: 'input-streaming',
          input: {},
        },
      ],
    } as unknown as UIMessage

    expect(getMessageSegments(message, true, true)).toEqual([
      { type: 'text', key: 'm6-text-0', text: 'Done.' },
    ])
  })
})
