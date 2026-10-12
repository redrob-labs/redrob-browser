/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The stage-change guard (Recruit plan §4.8), while a side-panel run saves someone to an ATS:
 *   * it stays on that ATS's host;
 *   * the long text it types is the note, word for word; short texts are the person's name, address
 *     or profile link, to find or add them;
 *   * it never presses a control that rejects, archives, disqualifies or dispositions;
 *   * it moves a stage only when the recruiter chose one, and only to that one;
 *   * it costs nothing, and runs no scripts.
 * The effect screenshots the page when the note is saved, for the receipt.
 */

import {
  errorResult,
  type ToolResult,
} from '@browseros/browser-mcp/tools/framework'
import {
  endsApplication,
  isChosenStage,
  movesStage,
  postsNote,
} from '@browseros/hiring/ats'
import { isPaidControl, sameMessage } from '@browseros/hiring/outreach'
import type { AtsBrowserRun, HiringAts } from '../../hiring-ats'
import type {
  BrowserToolCall,
  BrowserToolEffect,
  BrowserToolGuard,
} from '../browser-tool-dispatch'

let source: Pick<
  HiringAts,
  'activeRun' | 'markNotePosted' | 'markStageMoved'
> | null = null

/** Called once by the server. */
export function setAtsSource(next: typeof source): void {
  source = next
}

/** Text shorter than this is a search box or a field, not the note. */
const NOTE_LENGTH = 40

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
    kind === 'select' ||
    (kind === 'press' && /enter/i.test(String(call.args.key ?? '')))
  if (!pressing || typeof call.args.ref !== 'string') return
  const name = call.context.session
    .observe(call.args.page)
    .lastRefs.get(call.args.ref)?.name
  // A select's chosen option is what it does.
  return kind === 'select' && typeof call.args.value === 'string'
    ? `${name ?? ''} ${call.args.value}`.trim()
    : name
}

function typedTexts(call: BrowserToolCall): string[] {
  if (call.tool.name !== 'act') return []
  const { kind, text, value, fields } = call.args
  if (kind === 'type' && typeof text === 'string') return [text]
  if (kind === 'fill') {
    if (Array.isArray(fields))
      return (fields as Array<{ value: string }>).map((f) => String(f.value))
    if (typeof value === 'string') return [value]
  }
  return []
}

export function guardAtsCall(
  call: BrowserToolCall,
  run: AtsBrowserRun | null,
): ToolResult | null {
  if (!run) return null
  const name = call.tool.name
  if (
    name === 'navigate' &&
    typeof call.args.url === 'string' &&
    !onHost(call.args.url, run.host)
  ) {
    return errorResult(
      `navigate: this save is done on ${run.host} only. Stop and tell the person.`,
    )
  }
  if (name === 'run' || name === 'evaluate' || name === 'upload') {
    return errorResult(
      `${name}: not while saving to the ATS. Use its own pages and buttons.`,
    )
  }
  for (const text of typedTexts(call)) {
    const allowed =
      sameMessage(run.note, text) ||
      run.allowedTexts.some((t) => sameMessage(t, text)) ||
      text.length < NOTE_LENGTH
    if (!allowed) {
      return errorResult(
        'act: only the note may be written, exactly as given. Stop and tell the person.',
      )
    }
  }
  const target = pressed(call)
  if (!target) return null
  if (endsApplication(target)) {
    return errorResult(
      `act: "${target}" would reject, archive or end someone's application. Redrob never does that; it is the recruiter's decision, made by them. Stop and tell them.`,
    )
  }
  if (isPaidControl(target)) {
    return errorResult(
      `act: "${target}" costs money, so it is the person's to press. Stop and tell them.`,
    )
  }
  if (movesStage(target) && !run.stage) {
    return errorResult(
      `act: "${target}" changes their stage, and the recruiter did not choose one. Leave the stage as it is.`,
    )
  }
  if (run.stage && run.stageMoved && isChosenStage(target, run.stage)) {
    return errorResult(
      'act: they were already moved to the chosen stage. Nothing else changes in this run.',
    )
  }
  return null
}

export const guardHiringAts: BrowserToolGuard = (call) => {
  const run = source?.activeRun(call.lease?.conversationId) ?? null
  const rejection = guardAtsCall(call, run)
  if (run && !rejection) {
    // Read now: once the act runs, its diff may renumber the refs.
    call.atsPressed = pressed(call)
    if (typedTexts(call).some((t) => sameMessage(run.note, t)))
      run.noteTyped = true
  }
  return rejection
}

export const applyHiringAts: BrowserToolEffect = async ({ call, result }) => {
  const conversationId = call.lease?.conversationId
  if (result.isError || !source || !conversationId) return
  const run = source.activeRun(conversationId)
  const target = call.atsPressed
  if (!run || !target) return
  if (run.stage && isChosenStage(target, run.stage)) {
    source.markStageMoved(conversationId)
    return
  }
  // A save press after the note was typed: the note is posted.
  if (run.noteTyped && !run.notePosted && postsNote(target)) {
    let screenshot: { data: string } | undefined
    try {
      screenshot = await call.context.session.screenshot(
        call.args.page as number,
      )
    } catch {
      // A receipt without a picture still records the save; not a reason to fail the run.
    }
    await source.markNotePosted(conversationId, screenshot)
  }
}
