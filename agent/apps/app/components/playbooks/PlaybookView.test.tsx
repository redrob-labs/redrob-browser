/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'bun:test'
import type { Playbook } from '@browseros/playbooks/playbook'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { playbooksForUrl } from '@/modules/playbooks/playbooks.hooks'
import { readShared } from '@/screens/playbooks/PlaybooksPage'
import { PlaybookView } from './PlaybookView'
import { TeachRecording } from './TeachPanel'

const playbook: Playbook = {
  version: 1,
  id: 'p1',
  name: 'Weekly groceries',
  purpose: 'Reorder my usual groceries on Amazon Fresh',
  sites: ['amazon.com'],
  inputs: [{ id: 'grocery_list', label: 'Grocery list', example: 'oat milk' }],
  steps: [
    {
      intent: 'Open Amazon Fresh',
      hint: { url: 'https://www.amazon.com/fresh' },
      stop: false,
    },
    { intent: 'Find and add each item on {grocery_list}', stop: false },
    {
      intent: 'Press “Place your order”',
      hint: { target: 'Place your order' },
      stop: true,
      reason: 'This step is final, so you confirm it.',
    },
  ],
  createdAt: 0,
  updatedAt: 0,
  runs: 3,
}

describe('a playbook, as the panel shows it', () => {
  it('lists the steps, the inputs, the sites, and counts its stops from the steps', () => {
    const text = renderToStaticMarkup(
      createElement(PlaybookView, { playbook }),
    ).replace(/<[^>]+>/g, ' ')
    expect(text).toContain('Find and add each item on ‹Grocery list›')
    expect(text).toContain('Asks you for: Grocery list')
    expect(text).toContain('Works on: amazon.com')
    expect(text).toContain('Stops and asks')
    expect(text).toContain('Stops for you once before anything is final')
    expect(text).toContain('3 steps')
  })

  it('while teaching, shows what has been understood so far', () => {
    const html = renderToStaticMarkup(
      createElement(TeachRecording, {
        events: [
          {
            kind: 'navigate',
            url: 'https://www.amazon.com/fresh',
            title: 'Amazon Fresh',
            at: 0,
          },
          {
            kind: 'click',
            url: 'https://www.amazon.com/fresh',
            role: 'button',
            name: 'Add to cart',
            at: 1,
          },
        ],
        paused: false,
        onPause: () => {},
        onDiscard: () => {},
        onDone: () => {},
      }),
    )
    expect(html).toContain('Teaching Redrob')
    expect(html).toContain('2 steps so far')
    expect(html).toContain('Press “Add to cart”')
    expect(html).toContain('Passwords and card numbers are never recorded')
  })
})

describe('sharing and running', () => {
  it('an imported playbook gets a new id, no run history, and every final step stops', () => {
    const tampered = {
      ...playbook,
      steps: playbook.steps.map((s) => ({ ...s, stop: false })),
    }
    const read = readShared(JSON.stringify(tampered), 5)
    if (typeof read === 'string') throw new Error(read)
    expect(read.id).not.toBe('p1')
    expect(read.runs).toBe(0)
    expect(read.steps.at(-1)?.stop).toBe(true)
    expect(readShared('{"version":1}', 5)).toBe('no name')
    expect(readShared('not json', 5)).toBe('not JSON')
  })

  it('offers a playbook on its own sites only', () => {
    expect(
      playbooksForUrl([playbook], 'https://www.amazon.com/s?k=x'),
    ).toHaveLength(1)
    expect(
      playbooksForUrl([playbook], 'https://smile.amazon.com/'),
    ).toHaveLength(1)
    expect(playbooksForUrl([playbook], 'https://notamazon.com/')).toHaveLength(
      0,
    )
  })
})
