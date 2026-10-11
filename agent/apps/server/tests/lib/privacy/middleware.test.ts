/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider'
import {
  generateText,
  jsonSchema,
  stepCountIs,
  streamText,
  tool,
  wrapLanguageModel,
} from 'ai'
import { DetectorSource } from '../../../src/lib/privacy/detector-source'
import { PrivacyGate, PrivacyGateError } from '../../../src/lib/privacy/gate'
import {
  privacyMiddleware,
  safePrefixLength,
} from '../../../src/lib/privacy/middleware'
import { PrivacySettingsStore } from '../../../src/lib/privacy/settings'

const dirs: string[] = []
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() ?? '', { recursive: true, force: true })
})

async function gateAt(level: 'off' | 'standard' | 'high') {
  const dir = mkdtempSync(join(tmpdir(), 'redrob-privacy-mw-'))
  dirs.push(dir)
  const gate = new PrivacyGate(
    new PrivacySettingsStore(join(dir, 'privacy.json')),
    new DetectorSource({
      directory: join(dir, 'model'),
      fetchFile: async () => {
        throw new Error('offline')
      },
    }),
  )
  await gate.update({ level })
  return gate
}

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
}

/** A model that records every prompt it is sent and answers with scripted stream parts. */
function scriptedModel(turns: LanguageModelV4StreamPart[][]) {
  const prompts: LanguageModelV4CallOptions['prompt'][] = []
  let turn = 0
  const model: LanguageModelV4 = {
    specificationVersion: 'v4',
    provider: 'test',
    modelId: 'scripted',
    supportedUrls: {},
    async doGenerate(options) {
      prompts.push(options.prompt)
      return {
        content: [
          { type: 'text', text: 'Saved [EMAIL_1].' },
          {
            type: 'tool-call',
            toolCallId: 't1',
            toolName: 'fill',
            input: JSON.stringify({ value: '[EMAIL_1]' }),
          },
        ],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
        warnings: [],
      }
    },
    async doStream(options) {
      prompts.push(options.prompt)
      const parts = turns[turn++] ?? []
      return {
        stream: new ReadableStream({
          start(controller) {
            for (const part of parts) controller.enqueue(part)
            controller.close()
          },
        }),
      }
    },
  }
  return { model, prompts }
}

const finish: LanguageModelV4StreamPart = {
  type: 'finish',
  finishReason: { unified: 'stop', raw: 'stop' },
  usage,
}

const textTurn = (...deltas: string[]): LanguageModelV4StreamPart[] => [
  { type: 'text-start', id: 'a' },
  ...deltas.map((delta) => ({ type: 'text-delta' as const, id: 'a', delta })),
  { type: 'text-end', id: 'a' },
  finish,
]

const promptText = (prompt: LanguageModelV4CallOptions['prompt']) =>
  JSON.stringify(prompt)

describe('privacy middleware', () => {
  it('sends labels, and streams the real values back even when a label is split', async () => {
    const gate = await gateAt('standard')
    const { model, prompts } = scriptedModel([
      textTurn('I will write to [EMA', 'IL_1', '] and [PHONE_', '1].'),
    ])
    const wrapped = wrapLanguageModel({
      model,
      middleware: privacyMiddleware(gate, 'c1'),
    })
    const result = streamText({
      model: wrapped,
      system: 'You are a browser agent.',
      prompt: 'Email jiwon@example.com, phone 010-1234-5678.',
    })
    const deltas: string[] = []
    for await (const delta of result.textStream) deltas.push(delta)

    const sent = promptText(prompts[0] ?? [])
    expect(sent).not.toContain('jiwon@example.com')
    expect(sent).not.toContain('010-1234-5678')
    expect(sent).toContain('[EMAIL_1]')
    expect(sent).toContain('Keep every label exactly as written')
    expect(deltas.join('')).toBe(
      'I will write to jiwon@example.com and 010-1234-5678.',
    )
    // No delta ever showed a half label.
    expect(deltas.some((delta) => /\[EMA|IL_1|PHONE_/.test(delta))).toBe(false)
  })

  it('labels page text a tool returned, and gives the tool the real value', async () => {
    const gate = await gateAt('standard')
    const received: unknown[] = []
    const { model, prompts } = scriptedModel([
      [
        {
          type: 'tool-call',
          toolCallId: 'read-1',
          toolName: 'read_page',
          input: '{}',
        },
        {
          ...finish,
          finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
        },
      ],
      [
        {
          type: 'tool-call',
          toolCallId: 'fill-1',
          toolName: 'fill',
          input: JSON.stringify({ value: '[EMAIL_1]' }),
        },
        {
          ...finish,
          finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
        },
      ],
      textTurn('Done.'),
    ])
    const result = streamText({
      model: wrapLanguageModel({
        model,
        middleware: privacyMiddleware(gate, 'c2'),
      }),
      prompt: 'Copy the contact email into the form.',
      stopWhen: stepCountIs(5),
      tools: {
        read_page: tool({
          inputSchema: jsonSchema({ type: 'object' }),
          execute: async () => 'Contact: owner@shop.example',
        }),
        fill: tool({
          inputSchema: jsonSchema<{ value: string }>({
            type: 'object',
            properties: { value: { type: 'string' } },
          }),
          execute: async (input) => {
            received.push(input)
            return 'ok'
          },
        }),
      },
    })
    await result.consumeStream()

    expect(received).toEqual([{ value: 'owner@shop.example' }])
    // The page text and the earlier tool call went back to the model as labels.
    for (const prompt of prompts.slice(1)) {
      expect(promptText(prompt)).not.toContain('owner@shop.example')
    }
    expect(promptText(prompts[2] ?? [])).toContain('[EMAIL_1]')
  })

  it('leaves out screenshots at High, with a note the model can read', async () => {
    const gate = await gateAt('high')
    const { model, prompts } = scriptedModel([
      [
        { type: 'tool-call', toolCallId: 's1', toolName: 'shot', input: '{}' },
        {
          ...finish,
          finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
        },
      ],
      textTurn('ok'),
    ])
    const result = streamText({
      model: wrapLanguageModel({
        model,
        middleware: privacyMiddleware(gate, 'c3'),
      }),
      prompt: 'Look at the page.',
      stopWhen: stepCountIs(3),
      tools: {
        shot: tool({
          inputSchema: jsonSchema({ type: 'object' }),
          execute: async () => ({ image: 'iVBORw0KGgo=' }),
          toModelOutput: () => ({
            type: 'content',
            value: [
              {
                type: 'file',
                data: { type: 'data', data: 'iVBORw0KGgo=' },
                mediaType: 'image/png',
              },
            ],
          }),
        }),
      },
    })
    await result.consumeStream()
    const second = promptText(prompts[1] ?? [])
    expect(second).not.toContain('iVBORw0KGgo=')
    expect(second).toContain('A screenshot was left out')
  })

  it('restores generated text and tool input', async () => {
    const gate = await gateAt('standard')
    await gate.label('c4', ['jiwon@example.com'])
    const { model } = scriptedModel([])
    const wrapped = wrapLanguageModel({
      model,
      middleware: privacyMiddleware(gate, 'c4'),
    })
    const result = await generateText({ model: wrapped, prompt: 'hi' })
    expect(result.text).toBe('Saved jiwon@example.com.')
    expect(result.toolCalls[0]?.input).toEqual({ value: 'jiwon@example.com' })
  })

  it('passes everything through when protection is off', async () => {
    const gate = await gateAt('off')
    const { model, prompts } = scriptedModel([textTurn('[EMAIL_1] stays')])
    const result = streamText({
      model: wrapLanguageModel({
        model,
        middleware: privacyMiddleware(gate, 'c5'),
      }),
      prompt: 'jiwon@example.com',
    })
    expect(await result.text).toBe('[EMAIL_1] stays')
    expect(promptText(prompts[0] ?? [])).toContain('jiwon@example.com')
  })

  it('sends nothing when labelling fails', async () => {
    const gate = await gateAt('standard')
    gate.label = async () => {
      throw new PrivacyGateError(new Error('boom'))
    }
    const { model, prompts } = scriptedModel([textTurn('never')])
    const result = streamText({
      model: wrapLanguageModel({
        model,
        middleware: privacyMiddleware(gate, 'c6'),
      }),
      prompt: 'jiwon@example.com',
      onError: () => {},
    })
    await result.consumeStream()
    expect(prompts).toHaveLength(0)
  })
})

describe('safePrefixLength', () => {
  it('holds back only what could still become a label', () => {
    expect(safePrefixLength('hello')).toBe(5)
    expect(safePrefixLength('to [EMA')).toBe(3)
    expect(safePrefixLength('to [EMAIL_1] ok')).toBe(15)
    expect(safePrefixLength('call PHONE_')).toBe(5)
    expect(safePrefixLength('a [link](x) [')).toBe(12)
  })
})
