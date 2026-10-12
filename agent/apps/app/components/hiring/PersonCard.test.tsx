/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'bun:test'
import type { Criterion } from '@browseros/hiring/criteria'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { PersonOnRole, Role } from '@/modules/hiring/hiring.hooks'
import { eventText, refusalText } from '@/modules/hiring/labels'
import { CriteriaEditor } from './CriteriaEditor'
import { PersonCard } from './PersonCard'

const criteria: Criterion[] = [
  { id: 'y', text: '5+ years', kind: 'must', check: { type: 'years', min: 5 } },
  { id: 'p', text: 'Built payment systems', kind: 'nice' },
  { id: 'l', text: 'Led a team', kind: 'nice', inferred: true },
]

const role: Role = {
  id: 'r',
  title: 'Backend Engineer',
  location: 'Seoul',
  description: null,
  criteria: { version: 2, items: criteria },
  mode: 'review',
  sites: [],
  createdAt: 0,
  updatedAt: 0,
}

const person = (overrides: Partial<PersonOnRole> = {}): PersonOnRole => ({
  id: 'p1',
  record: {
    url: 'https://www.linkedin.com/in/jiwon',
    site: 'linkedin',
    name: 'Jiwon Kim',
    headline: 'Senior Engineer',
    positions: [],
    education: [],
    skills: [],
    languages: [],
    links: [],
    contact: [],
  },
  sites: ['linkedin'],
  readByModel: false,
  stage: 'found',
  foundAt: 0,
  evaluation: {
    criteriaVersion: 2,
    results: [
      {
        criterionId: 'y',
        state: 'met',
        evidence: '7 years in dated roles',
        by: 'device',
      },
      { criterionId: 'p', state: 'unknown', by: 'model' },
    ],
    met: 1,
    judged: 1,
    meetsEveryMust: true,
    suggestsSetAside: false,
  },
  ...overrides,
})

const render = (p: PersonOnRole) =>
  renderToStaticMarkup(
    createElement(PersonCard, {
      role,
      person: p,
      onShortlist: () => {},
      onSetAside: () => {},
    }),
  )

describe('PersonCard', () => {
  it('shows Meets n of m over judged criteria, evidence, and what was never used', () => {
    const html = render(person())
    expect(html).toContain('Meets 1 of 1')
    expect(html).toContain('“7 years in dated roles”')
    expect(html).toContain('rr-match__row--unknown')
    expect(html).toContain('Not used: photo, age, gender, name')
    expect(html).toContain('Redrob never rejects anyone. You decide.')
    // An unconfirmed assumption is not a criterion yet.
    expect(html).not.toContain('Led a team')
  })

  it('a missing must have is a suggestion, and AI-addressed text is a neutral note', () => {
    const base = person()
    const html = render({
      ...base,
      record: { ...base.record, addressesAi: true },
      evaluation: base.evaluation && {
        ...base.evaluation,
        suggestsSetAside: true,
      },
    })
    expect(html).toContain('Setting someone aside is your call.')
    expect(html).toContain('instructions addressed to AI tools')
  })
})

describe('CriteriaEditor', () => {
  it('marks assumptions, device checks, refused wording, and the fixed Never use list', () => {
    const html = renderToStaticMarkup(
      createElement(CriteriaEditor, {
        items: [
          { text: '5+ years', kind: 'must' },
          { text: 'Led a team', kind: 'nice', inferred: true },
          { text: 'Recent graduate', kind: 'must' },
        ],
        onChange: () => {},
      }),
    )
    expect(html).toContain('Checked on this computer')
    expect(html).toContain('My assumption')
    expect(html).toContain('it stands in for age.')
    expect(html).toContain('graduation year')
  })
})

describe('hiring labels', () => {
  it('words refusals and record lines without naming anyone', () => {
    expect(refusalText('No career gaps', 'family-proxy')).toContain(
      'family or military service',
    )
    expect(
      eventText({
        id: 'e',
        roleId: 'r',
        personId: 'p',
        kind: 'set-aside',
        actor: 'recruiter',
        detail: { reason: 'not-looking' },
        at: 0,
      }),
    ).toBe('Set someone aside: Not looking')
  })
})
