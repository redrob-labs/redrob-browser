/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'bun:test'
import type { Application } from '@browseros/jobs/applications'
import { matchJob } from '@browseros/jobs/match'
import type { JobPosting } from '@browseros/jobs/posting'
import { EMPTY_PROFILE, type JobProfile } from '@browseros/jobs/profile'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { sortApplications } from '@/modules/jobs/labels'
import { JobPostingCard } from './JobPostingCard'

const posting: JobPosting = {
  title: 'Senior Product Designer',
  company: 'Acme',
  location: 'Seoul',
  description: 'You will design in Figma. Fully remote within Korea.',
  url: 'https://boards.greenhouse.io/acme/jobs/1',
  source: 'json-ld',
}

const profile: JobProfile = {
  ...EMPTY_PROFILE,
  criteria: [
    { id: 'figma', text: 'Figma', kind: 'must', keywords: ['figma'] },
    { id: 'visa', text: 'Visa sponsorship', kind: 'must', keywords: ['visa'] },
  ],
}

const render = (mode: JobProfile['mode'], p: JobProfile = profile) =>
  renderToStaticMarkup(
    createElement(JobPostingCard, {
      posting,
      profile: p,
      match: matchJob(posting, p.criteria),
      mode,
      unanswered: 3,
      onModeChange: () => {},
      onApply: () => {},
      onShortlist: () => {},
      onClose: () => {},
      onOpenProfile: () => {},
    }),
  )

describe('JobPostingCard', () => {
  it('counts only conditions with evidence, and says which the posting is silent on', () => {
    const html = render('review')
    expect(html).toContain('Meets 1 of 1')
    expect(html).toContain('“You will design in Figma.”')
    expect(html).toContain('The posting doesn&#x27;t mention this')
    expect(html).toContain('rr-match__row--unknown')
  })

  it('words the primary action for the mode, and warns automatic applying will skip it', () => {
    expect(render('review')).toContain('Fill the application')
    const automatic = render('automatic')
    expect(automatic).toContain('Apply now')
    expect(automatic).toContain('Automatic applying skips this job')
    expect(automatic).toContain('up to 10 a day')
  })

  it('says what the profile is missing instead of guessing', () => {
    const html = render('batch')
    expect(html).toContain('No résumé yet')
    expect(html).toContain('3 common questions have no answer yet')
    const ready = render('batch', {
      ...profile,
      resume: { name: 'cv.pdf', size: 1, addedAt: 0 },
    })
    expect(ready).not.toContain('No résumé yet')
  })

  it('asks for criteria rather than showing an empty verdict', () => {
    const html = render('review', { ...EMPTY_PROFILE })
    expect(html).toContain('Add what you&#x27;re looking for')
    expect(html).not.toContain('Meets')
  })
})

describe('sortApplications', () => {
  it('puts what needs the person first', () => {
    const at = (status: Application['status'], updatedAt: number) =>
      ({ id: status, posting, status, createdAt: 0, updatedAt }) as Application
    const order = sortApplications([
      at('sent', 9),
      at('queued', 8),
      at('needs-you', 1),
      at('ready', 5),
    ]).map((a) => a.status)
    expect(order).toEqual(['needs-you', 'ready', 'queued', 'sent'])
  })
})
