/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import {
  normalizeSuggestedReplies,
  REPLY_SUGGESTIONS_TYPE,
  splitTrailingOptionsLine,
} from '@browseros/shared/schemas/reply-suggestions'
import type { UIMessage } from 'ai'

export type ToolInvocationState =
  | 'partial-call'
  | 'call'
  | 'result'
  | 'input-streaming'
  | 'input-available'
  | 'output-available'
  | 'output-error'
  | 'approval-requested'
  | 'approval-responded'
  | 'output-denied'

export interface ToolInvocationInfo {
  state: ToolInvocationState
  toolCallId: string
  toolName: string
  input: Record<string, unknown>
  output: unknown
  approval?: { id: string; approved?: boolean; reason?: string }
}

export type NudgeType = 'schedule_suggestion' | 'app_connection'

export interface NudgeData {
  type: NudgeType
  [key: string]: unknown
}

export type MessageSegment =
  | { type: 'text'; key: string; text: string }
  | { type: 'reasoning'; key: string; text: string; isStreaming: boolean }
  | { type: 'tool-batch'; key: string; tools: ToolInvocationInfo[] }
  | { type: 'nudge'; key: string; nudgeType: NudgeType; data: NudgeData }
  | { type: 'reply-suggestions'; key: string; replies: string[] }

const NUDGE_TOOLS = new Set([
  'suggest_schedule',
  'suggest_app_connection',
  'suggest_replies',
])

function parseReplySuggestions(output: unknown): string[] | null {
  try {
    const result = output as {
      content?: Array<{ type: string; text?: string }>
      isError?: boolean
    }
    if (result?.isError) return null
    const text = result?.content?.find((c) => c.type === 'text')?.text
    if (!text) return null
    const parsed = JSON.parse(text)
    if (parsed?.type !== REPLY_SUGGESTIONS_TYPE) return null
    if (!Array.isArray(parsed.replies)) return null
    const replies = normalizeSuggestedReplies(
      parsed.replies.filter((r: unknown) => typeof r === 'string'),
    )
    return replies.length > 0 ? replies : null
  } catch {
    return null
  }
}

function parseNudgeOutput(output: unknown): NudgeData | null {
  try {
    const result = output as {
      content?: Array<{ type: string; text?: string }>
      isError?: boolean
    }
    if (result?.isError) return null

    const text = result?.content?.find((c) => c.type === 'text')?.text
    if (!text) return null

    const parsed = JSON.parse(text)
    if (
      parsed?.type === 'schedule_suggestion' ||
      parsed?.type === 'app_connection'
    ) {
      return parsed as NudgeData
    }
  } catch {
    return null
  }
  return null
}

type RawToolPart = {
  toolCallId: string
  type: string
  toolName?: string
  state: ToolInvocationState
  input: Record<string, unknown>
  output: unknown
  approval?: { id: string; approved?: boolean; reason?: string }
}

function toolNameOf(part: RawToolPart): string {
  return part.type === 'dynamic-tool'
    ? (part.toolName ?? 'tool')
    : part.type.replace('tool-', '')
}

/**
 * Split a trailing `[OPTIONS: a | b]` line off the final assistant text. Only the final text of
 * a settled assistant message is eligible, so a half-streamed line is never cut.
 */
function splitFinalText(
  text: string,
  eligible: boolean,
): { text: string; replies: string[] | null } {
  if (!eligible) return { text, replies: null }
  const split = splitTrailingOptionsLine(text)
  return split.replies.length > 0
    ? { text: split.text, replies: split.replies }
    : { text, replies: null }
}

export const getMessageSegments = (
  message: UIMessage,
  isLastMessage: boolean,
  isStreaming: boolean,
): MessageSegment[] => {
  const segments: MessageSegment[] = []
  let currentToolBatch: ToolInvocationInfo[] = []
  let textSegmentCount = 0
  let reasoningSegmentCount = 0
  // Reply chips come either from the suggest_replies tool or from a trailing
  // `[OPTIONS: a | b]` line an external agent wrote. One set per message; the tool wins.
  let replySuggestions: string[] | null = null
  const settled = !(isStreaming && isLastMessage)
  const lastTextIndex = message.parts.findLastIndex((p) => p.type === 'text')

  const flushToolBatch = () => {
    if (currentToolBatch.length > 0) {
      segments.push({
        type: 'tool-batch',
        key: `${message.id}-tools-${currentToolBatch[0].toolCallId}`,
        tools: [...currentToolBatch],
      })
      currentToolBatch = []
    }
  }

  const pushText = (raw: string, index: number) => {
    const { text, replies } = splitFinalText(
      raw,
      message.role === 'assistant' && settled && index === lastTextIndex,
    )
    if (replies) replySuggestions ??= replies
    // Keep an intentionally empty part; drop a part that was only the options line.
    if (text.length > 0 || raw.length === 0) {
      segments.push({
        type: 'text',
        key: `${message.id}-text-${textSegmentCount}`,
        text,
      })
    }
    textSegmentCount++
  }

  const pushTool = (toolPart: RawToolPart) => {
    const toolName = toolNameOf(toolPart)
    if (toolName === 'suggest_replies') {
      flushToolBatch()
      if (toolPart.state === 'output-available') {
        replySuggestions =
          parseReplySuggestions(toolPart.output) ?? replySuggestions
      }
      return
    }
    if (!NUDGE_TOOLS.has(toolName)) {
      currentToolBatch.push({
        state: toolPart.state,
        toolCallId: toolPart.toolCallId,
        toolName,
        input: toolPart?.input ?? {},
        output: toolPart?.output,
        approval: toolPart?.approval,
      })
      return
    }
    if (toolPart.state !== 'output-available') return
    flushToolBatch()
    const nudgeData = parseNudgeOutput(toolPart.output)
    if (nudgeData) {
      segments.push({
        type: 'nudge',
        key: `${message.id}-nudge-${toolPart.toolCallId}`,
        nudgeType: nudgeData.type,
        data: nudgeData,
      })
    }
  }

  for (let i = 0; i < message.parts.length; i++) {
    const part = message.parts[i]

    if (part.type === 'text') {
      flushToolBatch()
      pushText(part.text, i)
    } else if (part.type === 'reasoning') {
      flushToolBatch()
      segments.push({
        type: 'reasoning',
        key: `${message.id}-reasoning-${reasoningSegmentCount}`,
        text: part.text,
        isStreaming:
          isStreaming && i === message.parts.length - 1 && isLastMessage,
      })
      reasoningSegmentCount++
    } else if (part.type?.startsWith('tool-') || part.type === 'dynamic-tool') {
      pushTool(part as RawToolPart)
    }
  }

  flushToolBatch()

  if (replySuggestions) {
    segments.push({
      type: 'reply-suggestions',
      key: `${message.id}-replies`,
      replies: replySuggestions,
    })
  }

  return segments
}
