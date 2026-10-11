/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'bun:test'
import {
  isConsequential,
  normalisePlaybook,
  runPrompt,
  validatePlaybook,
} from '../src/playbook'
import {
  classifyValue,
  draftFromEvents,
  isSecretField,
  type TeachEvent,
} from '../src/teach'

const at = 0
const groceries: TeachEvent[] = [
  {
    kind: 'navigate',
    url: 'https://www.amazon.com/fresh',
    title: 'Amazon Fresh',
    at,
  },
  {
    kind: 'input',
    url: 'https://www.amazon.com/fresh',
    field: 'Search Amazon',
    value: 'o',
    valueClass: 'text',
    at,
  },
  {
    kind: 'input',
    url: 'https://www.amazon.com/fresh',
    field: 'Search Amazon',
    value: 'oat milk',
    valueClass: 'text',
    at,
  },
  { kind: 'submit', url: 'https://www.amazon.com/fresh', name: '', at },
  {
    kind: 'click',
    url: 'https://www.amazon.com/s?k=oat+milk',
    role: 'button',
    name: 'Add to cart',
    at,
  },
  {
    kind: 'click',
    url: 'https://www.amazon.com/s?k=oat+milk',
    role: 'button',
    name: 'Add to cart',
    at,
  },
  {
    kind: 'input',
    url: 'https://www.amazon.com/ap/signin',
    field: 'Password',
    valueClass: 'secret',
    at,
  },
  {
    kind: 'click',
    url: 'https://www.amazon.com/checkout',
    role: 'button',
    name: 'Place your order',
    at,
  },
]

describe('drafting a playbook from what was taught', () => {
  const draft = draftFromEvents(groceries, {
    id: 'p1',
    now: 1,
    name: 'Weekly groceries',
  })

  it('keeps intent, makes typed values inputs, and collapses repeats', () => {
    expect(draft.sites).toEqual(['amazon.com'])
    expect(draft.inputs).toEqual([
      { id: 'search_amazon', label: 'Search Amazon', example: 'o' },
    ])
    expect(draft.steps.map((s) => s.intent)).toEqual([
      'Open Amazon Fresh (amazon.com/fresh)',
      'Enter {search_amazon} into “Search Amazon”',
      'Submit the form',
      'Press “Add to cart”',
      'Enter your Password (you type this yourself)',
      'Press “Place your order”',
    ])
  })

  it('stops before anything final, and before secrets, which it never recorded', () => {
    expect(draft.steps.filter((s) => s.stop).map((s) => s.intent)).toEqual([
      'Enter your Password (you type this yourself)',
      'Press “Place your order”',
    ])
    expect(JSON.stringify(draft)).not.toContain('hunter2')
    expect(validatePlaybook(draft)).toBeNull()
  })

  it('a run re-plans from intent, fills inputs, and keeps every stop', () => {
    const prompt = runPrompt(draft, { search_amazon: 'oat milk, eggs' })
    expect(prompt).toContain('re-plan each step from its intent')
    expect(prompt).toContain('Enter oat milk, eggs into “Search Amazon”')
    expect(prompt).toContain('Work only on: amazon.com.')
    expect(prompt.match(/STOP before this step/g)).toHaveLength(2)
  })

  it('a shared playbook cannot remove a stop from a final step', () => {
    const tampered = {
      ...draft,
      steps: draft.steps.map((s) => ({ ...s, stop: false, reason: undefined })),
    }
    const fixed = normalisePlaybook(tampered)
    expect(fixed.steps.at(-1)?.stop).toBe(true)
    expect(validatePlaybook({ ...draft, version: 9 })).toContain('version')
    expect(validatePlaybook({ ...draft, sites: ['https://evil'] })).toContain(
      'host',
    )
  })
})

describe('what the recorder keeps', () => {
  it('never keeps passwords, card fields or codes, and marks private values', () => {
    expect(isSecretField({ type: 'password' })).toBe(true)
    expect(isSecretField({ autocomplete: 'cc-number' })).toBe(true)
    expect(isSecretField({ autocomplete: 'one-time-code' })).toBe(true)
    expect(isSecretField({ name: 'cvv' })).toBe(true)
    expect(isSecretField({ type: 'text', name: 'q' })).toBe(false)
    expect(classifyValue('jiwon@example.com')).toBe('private')
    expect(classifyValue('oat milk')).toBe('text')
  })

  it('knows final controls in English and Korean', () => {
    for (const name of [
      'Place your order',
      'Buy now',
      'Submit application',
      '결제하기',
      '주문하기',
      '보내기',
    ]) {
      expect(isConsequential(name)).toBe(true)
    }
    for (const name of ['Add to cart', 'Search', '장바구니 담기', 'Next']) {
      expect(isConsequential(name)).toBe(false)
    }
  })
})
