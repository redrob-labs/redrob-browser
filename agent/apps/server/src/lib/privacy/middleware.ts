/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The gate as AI SDK model middleware, wrapped around the Redrob agent's model.
 *
 * Every model call passes through it, so one seam covers what a person types, the system prompt,
 * page text and every other tool result, earlier answers and earlier tool-call inputs:
 *
 *   in   — every text in the prompt is labelled; at High and Strict an image or other file the
 *          gate cannot read is left out, with a note saying so.
 *   out  — streamed text is restored as it arrives, holding back a label until it is complete so
 *          `[EMAIL_` and `1]` never show half-restored; tool-call inputs are restored before the
 *          tool runs, so a form receives the real phone number the model never saw.
 *
 * If labelling fails, the call throws and nothing is sent.
 */

import type {
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4Message,
  LanguageModelV4Middleware,
  LanguageModelV4StreamPart,
  LanguageModelV4ToolResultOutput,
} from '@ai-sdk/provider'
import type { PrivacyLevel } from '@browseros/privacy/labels'
import type { PrivacyGate } from './gate'

type Prompt = LanguageModelV4CallOptions['prompt']
type UserPart = Extract<
  LanguageModelV4Message,
  { role: 'user' }
>['content'][number]
type AssistantPart = Extract<
  LanguageModelV4Message,
  { role: 'assistant' }
>['content'][number]
type ToolPart = Extract<
  LanguageModelV4Message,
  { role: 'tool' }
>['content'][number]

/** Model input, not copy: what the model reads in place of a file it was not given. */
const LEFT_OUT_NOTE = (what: string) =>
  `[${what} was left out: privacy protection cannot check this kind of file.]`

const leavesOutFiles = (level: PrivacyLevel) =>
  level === 'high' || level === 'strict'

export function privacyMiddleware(
  gate: PrivacyGate,
  conversationId: string,
): LanguageModelV4Middleware {
  return {
    specificationVersion: 'v4',
    transformParams: async ({ params }) => {
      // Off still runs: saved passwords and cards are labelled at every level (gate.labelSavedOnly).
      const prompt = await labelPrompt(gate, conversationId, params.prompt)
      const instruction = gate.instruction(conversationId)
      return {
        ...params,
        prompt: instruction
          ? [{ role: 'system', content: instruction }, ...prompt]
          : prompt,
      }
    },
    wrapGenerate: async ({ doGenerate }) => {
      const result = await doGenerate()
      return {
        ...result,
        content: result.content.map((part) =>
          restoreContent(gate, conversationId, part),
        ),
      }
    },
    wrapStream: async ({ doStream }) => {
      const result = await doStream()
      return {
        ...result,
        stream: result.stream.pipeThrough(
          restoringStream(gate, conversationId),
        ),
      }
    },
  }
}

async function labelPrompt(
  gate: PrivacyGate,
  id: string,
  prompt: Prompt,
): Promise<Prompt> {
  const level = gate.level()
  const out: Prompt = []
  for (const message of prompt) {
    switch (message.role) {
      case 'system': {
        const [content] = (await gate.label(id, [message.content])).texts
        out.push({ ...message, content: content ?? '' })
        break
      }
      case 'user': {
        const content: UserPart[] = []
        for (const part of message.content) {
          content.push(await labelUserPart(gate, id, level, part))
        }
        out.push({ ...message, content })
        break
      }
      case 'assistant': {
        const content: AssistantPart[] = []
        for (const part of message.content) {
          content.push(await labelAssistantPart(gate, id, level, part))
        }
        out.push({ ...message, content })
        break
      }
      case 'tool': {
        const content: ToolPart[] = []
        for (const part of message.content) {
          content.push(
            part.type === 'tool-result'
              ? {
                  ...part,
                  output: await labelOutput(gate, id, level, part.output),
                }
              : part,
          )
        }
        out.push({ ...message, content })
        break
      }
    }
  }
  return out
}

async function labelText(
  gate: PrivacyGate,
  id: string,
  text: string,
): Promise<string> {
  return (await gate.label(id, [text])).texts[0] ?? ''
}

/** A file part's text, when it carries text the gate can read. */
function fileText(data: unknown): string | null {
  if (data && typeof data === 'object' && 'type' in data && 'text' in data) {
    const { type, text } = data as { type: unknown; text: unknown }
    if (type === 'text' && typeof text === 'string') return text
  }
  return null
}

async function labelUserPart(
  gate: PrivacyGate,
  id: string,
  level: PrivacyLevel,
  part: UserPart,
): Promise<UserPart> {
  if (part.type === 'text') {
    return { ...part, text: await labelText(gate, id, part.text) }
  }
  const text = fileText(part.data)
  if (text !== null) {
    return {
      ...part,
      data: { ...(part.data as object), text: await labelText(gate, id, text) },
    } as UserPart
  }
  if (!leavesOutFiles(level)) return part
  return {
    type: 'text',
    text: LEFT_OUT_NOTE(`An attachment (${part.filename ?? part.mediaType})`),
  }
}

async function labelAssistantPart(
  gate: PrivacyGate,
  id: string,
  level: PrivacyLevel,
  part: AssistantPart,
): Promise<AssistantPart> {
  switch (part.type) {
    case 'text':
    case 'reasoning':
      return { ...part, text: await labelText(gate, id, part.text) }
    case 'tool-call':
      return { ...part, input: await gate.labelDeep(id, part.input) }
    case 'tool-result':
      return {
        ...part,
        output: await labelOutput(gate, id, level, part.output),
      }
    default:
      return part
  }
}

async function labelOutput(
  gate: PrivacyGate,
  id: string,
  level: PrivacyLevel,
  output: LanguageModelV4ToolResultOutput,
): Promise<LanguageModelV4ToolResultOutput> {
  switch (output.type) {
    case 'text':
    case 'error-text':
      return { ...output, value: await labelText(gate, id, output.value) }
    case 'json':
    case 'error-json':
      return {
        ...output,
        value: (await gate.labelDeep(id, output.value)) as typeof output.value,
      }
    case 'content': {
      const value: typeof output.value = []
      for (const item of output.value) {
        if (item.type === 'text') {
          value.push({ ...item, text: await labelText(gate, id, item.text) })
        } else if (item.type === 'file' && leavesOutFiles(level)) {
          // Screenshots are the common case: a picture of a page can hold anything on it.
          value.push({
            type: 'text',
            text: LEFT_OUT_NOTE(
              item.mediaType.startsWith('image/') ? 'A screenshot' : 'A file',
            ),
          })
        } else {
          value.push(item)
        }
      }
      return { ...output, value }
    }
    default:
      return output
  }
}

function restoreContent(
  gate: PrivacyGate,
  id: string,
  part: LanguageModelV4Content,
): LanguageModelV4Content {
  if (part.type === 'text' || part.type === 'reasoning') {
    return { ...part, text: gate.restore(id, part.text) }
  }
  if (part.type === 'tool-call') {
    return { ...part, input: restoreToolInput(gate, id, part.input) }
  }
  return part
}

/** A tool call's input arrives as JSON text; its strings get their real values back. */
export function restoreToolInput(
  gate: PrivacyGate,
  id: string,
  input: string,
): string {
  try {
    return JSON.stringify(gate.restoreDeep(id, JSON.parse(input)))
  } catch {
    return gate.restore(id, input)
  }
}

/**
 * How much of a streamed text can be shown yet. A label may still be arriving at the end: an open
 * bracket with no close, or a bare `PERSON_` / `PERSON_1` that a following digit could extend.
 */
export function safePrefixLength(text: string): number {
  const open = Math.max(text.lastIndexOf('['), text.lastIndexOf('［'))
  if (open !== -1 && text.length - open <= 24) {
    const tail = text.slice(open)
    if (!/[\]］]/.test(tail)) return open
  }
  const bare = /[A-Z][A-Z_0-9 ]{0,15}$/.exec(text)
  return bare ? bare.index : text.length
}

export function restoringStream(
  gate: PrivacyGate,
  id: string,
): TransformStream<LanguageModelV4StreamPart, LanguageModelV4StreamPart> {
  const pending = new Map<string, string>()
  const flush = (key: string, emit: (delta: string) => void, all: boolean) => {
    const buffered = pending.get(key) ?? ''
    const cut = all ? buffered.length : safePrefixLength(buffered)
    if (cut > 0) emit(gate.restore(id, buffered.slice(0, cut)))
    pending.set(key, buffered.slice(cut))
  }
  return new TransformStream({
    transform(part, controller) {
      if (part.type === 'text-delta' || part.type === 'reasoning-delta') {
        const key = `${part.type}:${part.id}`
        pending.set(key, (pending.get(key) ?? '') + part.delta)
        flush(key, (delta) => controller.enqueue({ ...part, delta }), false)
        return
      }
      if (part.type === 'text-end' || part.type === 'reasoning-end') {
        const kind = part.type === 'text-end' ? 'text-delta' : 'reasoning-delta'
        const key = `${kind}:${part.id}`
        flush(
          key,
          (delta) => controller.enqueue({ type: kind, id: part.id, delta }),
          true,
        )
        pending.delete(key)
        controller.enqueue(part)
        return
      }
      if (part.type === 'tool-call') {
        controller.enqueue({
          ...part,
          input: restoreToolInput(gate, id, part.input),
        })
        return
      }
      controller.enqueue(part)
    },
    flush(controller) {
      for (const [key, buffered] of pending) {
        if (!buffered) continue
        const [kind, ...rest] = key.split(':')
        controller.enqueue({
          type: kind as 'text-delta' | 'reasoning-delta',
          id: rest.join(':'),
          delta: gate.restore(id, buffered),
        })
      }
    },
  })
}
