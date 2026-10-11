/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * A playbook: a task taught once by doing it, kept as intent rather than as a script. A run re-plans
 * from the steps' intent, so a store that moved its buttons still works; the recorded hints only help.
 *
 * Versioned from the first release, so a playbook exported today still imports after the format grows,
 * and so it can sync once the browser has an account.
 */

export const PLAYBOOK_VERSION = 1

export interface PlaybookInput {
  /** `grocery_list` */
  id: string
  /** "Grocery list", what the person is asked for before a run. */
  label: string
  /** An example from the recording, absent when it was private. */
  example?: string
}

export interface PlaybookStep {
  /** What to achieve, in words: "Search for each item on {grocery_list}". */
  intent: string
  /** Where it happened when it was taught, as guidance only. */
  hint?: { url?: string; target?: string }
  /** Stops for the person before doing this. Consequential steps always stop. */
  stop: boolean
  /** Why it stops, in words, when it does. */
  reason?: string
}

export interface Playbook {
  version: typeof PLAYBOOK_VERSION
  id: string
  name: string
  purpose: string
  /** Hosts the playbook works on; a run may only act there. */
  sites: string[]
  inputs: PlaybookInput[]
  steps: PlaybookStep[]
  createdAt: number
  updatedAt: number
  runs: number
  lastRunAt?: number
}

/**
 * Words on a control that make clicking it final: paying, ordering, sending, submitting, deleting.
 * English and Korean, matched on the control's accessible name.
 */
export const CONSEQUENTIAL =
  /\b(place (your )?order|buy now|pay( now)?|checkout|check out|complete (purchase|order)|confirm (order|purchase|payment)|submit( application)?|send( message)?|delete|transfer|book now|subscribe)\b|결제|주문하기|구매하기|바로구매|주문 완료|송금|이체|제출|지원하기|보내기|전송|삭제|예약하기|구독/i

export function isConsequential(name: string): boolean {
  return CONSEQUENTIAL.test(name)
}

const ID = /^[a-z][a-z0-9_]{0,39}$/

/** A file someone shared, checked before it is shown for review. Returns why it is refused, or null. */
export function validatePlaybook(value: unknown): string | null {
  if (!value || typeof value !== 'object') return 'not a playbook'
  const p = value as Partial<Playbook>
  if (p.version !== PLAYBOOK_VERSION)
    return `unsupported version ${String(p.version)}`
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 120)
    return 'no name'
  if (typeof p.purpose !== 'string' || p.purpose.length > 500)
    return 'no purpose'
  if (
    !Array.isArray(p.sites) ||
    p.sites.length > 20 ||
    !p.sites.every((s) => typeof s === 'string' && /^[a-z0-9.-]+$/i.test(s))
  ) {
    return 'sites must be host names'
  }
  if (
    !Array.isArray(p.inputs) ||
    !p.inputs.every((i) => i && ID.test(i.id) && typeof i.label === 'string')
  ) {
    return 'bad inputs'
  }
  if (!Array.isArray(p.steps) || p.steps.length === 0 || p.steps.length > 60)
    return 'needs 1 to 60 steps'
  for (const step of p.steps) {
    if (
      !step ||
      typeof step.intent !== 'string' ||
      !step.intent.trim() ||
      step.intent.length > 500
    ) {
      return 'a step has no intent'
    }
    if (typeof step.stop !== 'boolean') return 'a step has no stop flag'
  }
  return null
}

/**
 * A playbook as a run should see it: a step on a final control (its recorded name) is a stop whatever
 * the file says, so a shared playbook cannot remove one, and the hosts are lower-cased. The guard in the
 * server stops a run at a final control even when no step names it.
 */
export function normalisePlaybook(playbook: Playbook): Playbook {
  return {
    ...playbook,
    sites: [
      ...new Set(
        playbook.sites.map((s) => s.toLowerCase().replace(/^www\./, '')),
      ),
    ],
    steps: playbook.steps.map((step) =>
      isConsequential(step.hint?.target ?? '') && !step.stop
        ? {
            ...step,
            stop: true,
            reason: step.reason ?? 'This step is final, so you confirm it.',
          }
        : step,
    ),
  }
}

/** The message that starts a run. Model input, not copy. */
export function runPrompt(
  playbook: Playbook,
  values: Record<string, string>,
): string {
  const p = normalisePlaybook(playbook)
  const fill = (text: string) =>
    text.replace(
      /\{([a-z][a-z0-9_]*)\}/g,
      (whole, id: string) => values[id] ?? whole,
    )
  const lines = [
    `Run my playbook "${p.name}": ${fill(p.purpose)}`,
    '',
    'I taught it by doing it once. The steps say what to achieve; the hints say where it happened then, and pages may have changed since, so re-plan each step from its intent rather than repeating clicks.',
    `Work only on: ${p.sites.join(', ')}.`,
  ]
  if (p.inputs.length) {
    lines.push('', 'Inputs:')
    for (const input of p.inputs)
      lines.push(
        `- ${input.label}: ${values[input.id] ?? '(not given — ask me)'}`,
      )
  }
  lines.push('', 'Steps:')
  p.steps.forEach((step, index) => {
    const hint = [
      step.hint?.url && `page ${step.hint.url}`,
      step.hint?.target && `"${step.hint.target}"`,
    ]
      .filter(Boolean)
      .join(', ')
    lines.push(
      `${index + 1}. ${fill(step.intent)}${hint ? ` (then: ${hint})` : ''}${step.stop ? ' — STOP before this step: tell me exactly what you are about to do and wait for me.' : ''}`,
    )
  })
  lines.push(
    '',
    'Never pay, order, submit, send or delete on your own: when you reach such a button, stop, tell me what is in the cart or form, and let me press it. If something does not match what I taught (an item is missing, a price looks wrong, a sign-in appears), stop and ask.',
  )
  return lines.join('\n')
}
