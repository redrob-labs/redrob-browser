/**
 * @license
 * Copyright 2026 Redrob and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Button, buttonVariants } from './button'

const classes = (el: string) =>
  (el.match(/class="([^"]*)"/)?.[1] ?? '').split(/\s+/)

describe('Button wears the design system', () => {
  it('maps each shadcn variant onto its .rr-btn tone', () => {
    const cases: [string, string][] = [
      ['default', 'rr-btn--primary'],
      ['outline', 'rr-btn--secondary'],
      ['secondary', 'rr-btn--secondary'],
      ['ghost', 'rr-btn--ghost'],
      ['destructive', 'rr-btn--danger'],
    ]
    for (const [variant, tone] of cases) {
      const c = classes(
        renderToStaticMarkup(
          <Button variant={variant as 'default'}>Go</Button>,
        ),
      )
      expect(c).toContain('rr-btn')
      expect(c).toContain(tone)
    }
  })

  it("uses the system's three control heights", () => {
    expect(
      classes(renderToStaticMarkup(<Button size="sm">a</Button>)),
    ).toContain('rr-btn--sm')
    expect(classes(renderToStaticMarkup(<Button>a</Button>))).toContain(
      'rr-btn--md',
    )
    expect(
      classes(renderToStaticMarkup(<Button size="lg">a</Button>)),
    ).toContain('rr-btn--lg')
  })

  it('renders an icon size as .rr-iconbtn', () => {
    const c = classes(
      renderToStaticMarkup(
        <Button size="icon-sm" variant="ghost" aria-label="Close" />,
      ),
    )
    expect(c).toContain('rr-iconbtn')
    expect(c).toContain('rr-iconbtn--sm')
    expect(c).not.toContain('rr-btn')
  })

  it("keeps shadcn's own focus glow off: the ring is the system's", () => {
    const c = classes(renderToStaticMarkup(<Button>a</Button>))
    expect(c.some((x) => x.startsWith('focus-visible:ring'))).toBe(false)
  })

  it('gives buttonVariants() callers the system button too', () => {
    expect(buttonVariants({ variant: 'outline' }).split(' ')).toContain(
      'rr-btn--secondary',
    )
  })
})
