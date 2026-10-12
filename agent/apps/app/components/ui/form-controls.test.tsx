/**
 * @license
 * Copyright 2026 Redrob and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Checkbox } from './checkbox'
import { Input } from './input'
import { Label } from './label'
import { Switch } from './switch'
import { Textarea } from './textarea'

const classes = (html: string) =>
  (html.match(/class="([^"]*)"/)?.[1] ?? '').split(/\s+/)
const glow = (c: string[]) => c.some((x) => /^focus-visible:ring/.test(x))

describe('form controls wear the design system', () => {
  it('Input is the system field at its default height', () => {
    const c = classes(renderToStaticMarkup(<Input />))
    expect(c).toEqual(expect.arrayContaining(['rr-control', 'rr-control--md']))
    expect(glow(c)).toBe(false)
  })

  it('Textarea is the system textarea and still grows with its content', () => {
    const c = classes(renderToStaticMarkup(<Textarea />))
    expect(c).toEqual(
      expect.arrayContaining([
        'rr-control',
        'rr-textarea',
        'field-sizing-content',
      ]),
    )
  })

  it('Label is the system field label', () => {
    expect(classes(renderToStaticMarkup(<Label>Name</Label>))).toContain(
      'rr-field__label',
    )
  })

  it("Checkbox and Switch take the system's ring and brand fill, not shadcn's glow", () => {
    for (const html of [
      renderToStaticMarkup(<Checkbox />),
      renderToStaticMarkup(<Switch />),
    ]) {
      const c = classes(html)
      expect(glow(c)).toBe(false)
      expect(c.some((x) => x.includes('var(--focus-ring)'))).toBe(true)
      expect(c.some((x) => x.includes('var(--action-primary)'))).toBe(true)
    }
  })

  it('Checkbox is 18px, the system choice box', () => {
    expect(classes(renderToStaticMarkup(<Checkbox />))).toContain('size-[18px]')
  })
})
