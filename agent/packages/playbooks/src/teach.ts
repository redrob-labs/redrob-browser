/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Teach Mode: what a person did, recorded as meaning (where they went, what they pressed, what they
 * typed into which field), and the draft playbook made from it.
 *
 * The recorder keeps no DOM, no selectors and no screenshots. A value typed into a password, card or
 * one-time-code field is never recorded, and a value that holds a private detail (an email, a phone
 * number, a card number…, found with Privacy Protection's own patterns) is kept only as "private".
 */

import { emptyLabelMap, labelText } from '@browseros/privacy/labels'
import {
  isConsequential,
  PLAYBOOK_VERSION,
  type Playbook,
  type PlaybookInput,
  type PlaybookStep,
} from './playbook'

export type TeachEvent =
  | { kind: 'navigate'; url: string; title: string; at: number }
  | { kind: 'click'; url: string; role: string; name: string; at: number }
  | {
      kind: 'input'
      url: string
      /** The field's label, placeholder or name. */
      field: string
      /** Absent when private or secret. */
      value?: string
      valueClass: 'text' | 'private' | 'secret'
      at: number
    }
  | { kind: 'submit'; url: string; name: string; at: number }

/** Field types and autocomplete tokens whose values are never recorded. */
export function isSecretField(field: {
  type?: string
  autocomplete?: string
  name?: string
}): boolean {
  if (field.type === 'password' || field.type === 'hidden') return true
  const ac = (field.autocomplete ?? '').toLowerCase()
  if (/cc-|one-time-code|current-password|new-password/.test(ac)) return true
  return /cvv|cvc|card.?num|security.?code|otp|pin\b|비밀번호|카드번호/i.test(
    field.name ?? '',
  )
}

/** How a typed value is kept: as text, or only as "private" when it holds a private detail. */
export function classifyValue(value: string): 'text' | 'private' {
  return labelText(value, { level: 'standard', names: [] }, emptyLabelMap())
    .found.length
    ? 'private'
    : 'text'
}

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function path(url: string): string {
  try {
    const u = new URL(url)
    return `${u.hostname.replace(/^www\./, '')}${u.pathname === '/' ? '' : u.pathname}`
  } catch {
    return url
  }
}

function inputId(field: string, taken: Set<string>): string {
  let base =
    field
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 30) || 'value'
  if (!/^[a-z]/.test(base)) base = `v_${base}`
  let id = base
  for (let n = 2; taken.has(id); n += 1) id = `${base}_${n}`
  taken.add(id)
  return id
}

/** How the draft words its steps, so a Korean person reads Korean steps. English by default. */
export interface DraftPhrases {
  open: (place: string) => string
  press: (name: string) => string
  enter: (input: string, field: string) => string
  enterSecret: (field: string) => string
  submit: (name?: string) => string
  finalReason: string
  secretReason: string
  name: (site?: string) => string
  purpose: (sites: string, inputs?: string) => string
}

export const ENGLISH_PHRASES: DraftPhrases = {
  open: (place) => `Open ${place}`,
  press: (name) => `Press “${name}”`,
  enter: (input, field) => `Enter ${input} into “${field}”`,
  enterSecret: (field) => `Enter your ${field} (you type this yourself)`,
  submit: (name) => (name ? `Submit “${name}”` : 'Submit the form'),
  finalReason: 'This step is final, so you confirm it.',
  secretReason:
    'Passwords and card details are never recorded; you enter them.',
  name: (site) => (site ? `My task on ${site}` : 'My task'),
  purpose: (sites, inputs) =>
    inputs
      ? `Do what I taught on ${sites}, with ${inputs}.`
      : `Do what I taught on ${sites}.`,
}

const clip = (text: string, max = 60) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text

type Kind = 'open' | 'press' | 'enter' | 'secret' | 'submit'

/**
 * A draft playbook from a recording. Typed values become inputs (asked for before each run), so
 * "oat milk" is not baked into the playbook; repeated presses and repeated typing collapse into one
 * step; a navigation a press caused is that press's result, not a step; anything that pays, orders,
 * submits or sends is a stop, and so is a secret field, which the person fills in themselves.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one switch over the four event kinds reads better whole than split.
export function draftFromEvents(
  events: readonly TeachEvent[],
  options: { id: string; now: number; name?: string; phrases?: DraftPhrases },
): Playbook {
  const say = options.phrases ?? ENGLISH_PHRASES
  const steps: Array<PlaybookStep & { kind: Kind }> = []
  const inputs: PlaybookInput[] = []
  const taken = new Set<string>()
  const byField = new Map<string, string>()
  const sites: string[] = []
  let lastNav = ''

  for (const event of events) {
    const h = host(event.url)
    if (h && !sites.includes(h)) sites.push(h)
    const last = steps.at(-1)
    switch (event.kind) {
      case 'navigate': {
        const where = path(event.url)
        if (where === lastNav) break
        lastNav = where
        if (
          (last?.kind === 'press' || last?.kind === 'submit') &&
          last.hint?.url &&
          host(last.hint.url) === h
        )
          break
        steps.push({
          kind: 'open',
          intent: say.open(
            event.title ? `${clip(event.title)} (${where})` : where,
          ),
          hint: { url: event.url },
          stop: false,
        })
        break
      }
      case 'click': {
        const name = event.name.trim()
        if (!name || (last?.kind === 'press' && last.hint?.target === name))
          break
        const final = isConsequential(name)
        steps.push({
          kind: 'press',
          intent: say.press(clip(name)),
          hint: { url: event.url, target: name },
          stop: final,
          reason: final ? say.finalReason : undefined,
        })
        break
      }
      case 'input': {
        const field = event.field.trim() || 'a field'
        if (event.valueClass === 'secret') {
          if (last?.kind === 'secret' && last.hint?.target === field) break
          steps.push({
            kind: 'secret',
            intent: say.enterSecret(clip(field, 40)),
            hint: { url: event.url, target: field },
            stop: true,
            reason: say.secretReason,
          })
          break
        }
        let id = byField.get(field)
        if (!id) {
          id = inputId(field, taken)
          byField.set(field, id)
          inputs.push({
            id,
            label: clip(field, 40),
            example: event.valueClass === 'text' ? event.value : undefined,
          })
        }
        // Typing into one field several times is one step: the last value is what counted.
        if (last?.kind === 'enter' && last.hint?.target === field) break
        steps.push({
          kind: 'enter',
          intent: say.enter(`{${id}}`, clip(field, 40)),
          hint: { url: event.url, target: field },
          stop: false,
        })
        break
      }
      case 'submit': {
        const final =
          isConsequential(event.name) ||
          /checkout|order|pay|apply/i.test(event.url)
        steps.push({
          kind: 'submit',
          intent: say.submit(event.name ? clip(event.name) : undefined),
          hint: { url: event.url, target: event.name || undefined },
          stop: final,
          reason: final ? say.finalReason : undefined,
        })
        break
      }
    }
  }

  const where = sites.join(', ')
  return {
    version: PLAYBOOK_VERSION,
    id: options.id,
    name: options.name?.trim() || say.name(sites[0]),
    purpose: say.purpose(
      where,
      inputs.length ? inputs.map((i) => i.label).join(', ') : undefined,
    ),
    sites,
    inputs,
    steps: steps.map(({ kind: _kind, ...step }) => step),
    createdAt: options.now,
    updatedAt: options.now,
    runs: 0,
  }
}
