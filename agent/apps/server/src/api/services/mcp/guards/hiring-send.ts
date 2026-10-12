/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * While a side-panel conversation sends one approved Talent Scout message (Recruit plan §4.8):
 *   * it stays on the person's site;
 *   * whatever long text it types or fills is the approved message, word for word;
 *   * it presses a send control once, and a control that costs money never;
 *   * the effect marks the message sent when that one press succeeds.
 * Decided here rather than by the model, so a profile's or a page's text cannot widen it.
 */

import {
  errorResult,
  type ToolResult,
} from '@browseros/browser-mcp/tools/framework'
import { isPaidControl, sameMessage } from '@browseros/hiring/outreach'
import { isConsequential } from '@browseros/playbooks/playbook'
import type { ActiveOutreachRun, HiringOutreach } from '../../hiring-outreach'
import type {
  BrowserToolCall,
  BrowserToolEffect,
  BrowserToolGuard,
} from '../browser-tool-dispatch'

let outreach: Pick<HiringOutreach, 'activeRun' | 'markSent'> | null = null

/** Called once by the server. */
export function setOutreachSource(
  next: Pick<HiringOutreach, 'activeRun' | 'markSent'> | null,
): void {
  outreach = next
}

/** Text shorter than this is a search box or a field, not a message. */
const MESSAGE_LENGTH = 40

function onHost(url: string, host: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase()
    return h === host || h.endsWith(`.${host}`)
  } catch {
    return false
  }
}

function pressed(call: BrowserToolCall): string | undefined {
  if (call.tool.name !== 'act' || typeof call.args.page !== 'number') return
  const kind = call.args.kind
  const pressing =
    kind === 'click' ||
    (kind === 'press' && /enter/i.test(String(call.args.key ?? '')))
  if (!pressing || typeof call.args.ref !== 'string') return
  return call.context.session
    .observe(call.args.page)
    .lastRefs.get(call.args.ref)?.name
}

function typedTexts(call: BrowserToolCall): string[] {
  if (call.tool.name !== 'act') return []
  const { kind, text, value, fields } = call.args
  if (kind === 'type' && typeof text === 'string') return [text]
  if (kind === 'fill') {
    if (Array.isArray(fields))
      return (fields as Array<{ value: string }>).map((f) => f.value)
    if (typeof value === 'string') return [value]
  }
  return []
}

export const guardHiringSend: BrowserToolGuard = (call) =>
  guardHiringSendCall(
    call,
    outreach?.activeRun(call.lease?.conversationId) ?? null,
  )

export function guardHiringSendCall(
  call: BrowserToolCall,
  run: ActiveOutreachRun | null,
): ToolResult | null {
  if (!run) return null
  const name = call.tool.name
  if (
    name === 'navigate' &&
    typeof call.args.url === 'string' &&
    !onHost(call.args.url, run.host)
  ) {
    return errorResult(
      `navigate: this message is sent on ${run.host} only. Stop and tell the person.`,
    )
  }
  if (name === 'run' || name === 'evaluate' || name === 'upload') {
    return errorResult(
      `${name}: not while sending an approved message. Use the site's own message box.`,
    )
  }
  for (const text of typedTexts(call)) {
    if (text.length >= MESSAGE_LENGTH && !sameMessage(run.body, text)) {
      return errorResult(
        'act: only the approved message may be typed, exactly as written. Stop and tell the person.',
      )
    }
  }
  const target = pressed(call)
  if (target && isPaidControl(target)) {
    return errorResult(
      `act: "${target}" costs money, so it is the person's to press. Stop and tell them.`,
    )
  }
  if (target && isConsequential(target) && run.sent) {
    return errorResult(
      'act: this message was already sent. Stop: nothing else is sent in this run.',
    )
  }
  return null
}

/** The send press succeeded: the message is sent. */
export const applyHiringSend: BrowserToolEffect = ({ call, result }) => {
  const conversationId = call.lease?.conversationId
  if (result.isError || !outreach || !conversationId) return
  const run = outreach.activeRun(conversationId)
  if (!run || run.sent) return
  const target = call.hiringPressed
  if (target && isConsequential(target)) outreach.markSent(conversationId)
}

/** Reads the pressed control's name before the act runs (refs may change after). */
export const recordHiringPress: BrowserToolGuard = (call) => {
  if (outreach?.activeRun(call.lease?.conversationId))
    call.hiringPressed = pressed(call)
  return null
}
