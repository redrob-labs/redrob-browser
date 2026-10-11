/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'bun:test'
import { parseHTML } from 'linkedom'
import { answerFor, usableAnswer } from '../src/answers'
import { type Application, canQueue, dedupeKey } from '../src/applications'
import { matchJob } from '../src/match'
import { detectJobPosting } from '../src/posting'
import { EMPTY_PROFILE, starterAnswers } from '../src/profile'
import { applyPrompt } from '../src/prompt'
import { JOB_SITES, jobRegionForLocale } from '../src/sites'

const greenhouse = parseHTML(`<html><head><script type="application/ld+json">
{"@context":"https://schema.org","@type":"JobPosting","title":"Senior Product Designer",
 "hiringOrganization":{"@type":"Organization","name":"Acme Robotics"},
 "jobLocation":{"@type":"Place","address":{"addressLocality":"Seoul","addressCountry":"KR"}},
 "description":"<p>We are hiring a product designer.</p><ul><li>5+ years designing B2B SaaS.</li><li>Fluent in Figma.</li></ul><p>Hybrid, 3 days in the office.</p>"}
</script></head><body></body></html>`).document

const posting = detectJobPosting(
  greenhouse,
  'https://boards.greenhouse.io/acme/jobs/123',
)

describe('reading a job posting', () => {
  it('reads schema.org JobPosting, the company, place, text and the system it belongs to', () => {
    expect(posting).toMatchObject({
      title: 'Senior Product Designer',
      company: 'Acme Robotics',
      location: 'Seoul, KR',
      system: 'greenhouse',
      source: 'json-ld',
    })
    expect(posting?.description).toContain('5+ years designing B2B SaaS.')
    expect(posting?.description).not.toContain('<li>')
  })
  it('is null on a page that advertises no job', () => {
    expect(
      detectJobPosting(
        parseHTML('<html><body>news</body></html>').document,
        'https://news.example/',
      ),
    ).toBeNull()
  })
})

describe('matching against what the person wants', () => {
  const criteria = [
    {
      id: 'c1',
      text: 'B2B SaaS',
      kind: 'must' as const,
      keywords: ['b2b', 'saas'],
    },
    {
      id: 'c2',
      text: 'Hybrid or remote',
      kind: 'must' as const,
      keywords: ['hybrid', 'remote'],
    },
    {
      id: 'c3',
      text: 'Visa sponsorship',
      kind: 'nice' as const,
      keywords: ['sponsor'],
    },
  ]
  it('quotes the evidence, and leaves a condition the posting is silent on out of the count', () => {
    if (!posting) throw new Error('no posting')
    const match = matchJob(posting, criteria)
    expect(match.items.map((i) => i.state)).toEqual(['met', 'met', 'unknown'])
    expect(match.items[1]?.evidence).toBe('Hybrid, 3 days in the office.')
    expect(match.met).toBe(2)
    expect(match.judged).toBe(2)
    expect(match.qualifies).toBe(true)
  })
  it('a missing must-have means it does not qualify for automatic sending', () => {
    if (!posting) throw new Error('no posting')
    expect(
      matchJob(posting, [
        { id: 'c', text: 'Rust', kind: 'must', keywords: ['rust'] },
      ]).qualifies,
    ).toBe(false)
  })
})

describe('the answer bank', () => {
  const bank = starterAnswers().map((a) =>
    a.id === 'notice'
      ? { ...a, answer: '1 month' }
      : a.id === 'salary'
        ? { ...a, answer: '₩90,000,000' }
        : a,
  )
  it('answers a form question from the bank, in English or Korean, and never guesses', () => {
    expect(answerFor('When can you start?', bank)?.id).toBe('notice')
    expect(answerFor('입사 가능일을 알려주세요', bank)?.id).toBe('notice')
    expect(answerFor('What is your current CTC?', bank)?.id).toBe(
      'current_salary',
    )
    expect(answerFor('Expected CTC', bank)?.id).toBe('salary')
    expect(answerFor('Why do you want to work here?', bank)).toBeNull()
  })
  it('an empty voluntary question is declined; an empty ordinary one has no answer', () => {
    const gender = bank.find((a) => a.id === 'gender')
    const phone = bank.find((a) => a.id === 'phone')
    if (!gender || !phone) throw new Error('starter')
    expect(usableAnswer(gender)).toContain('Decline')
    expect(usableAnswer(phone)).toBeNull()
  })
  it('the application message gives only the bank’s answers, and stops before submit when reviewing', () => {
    if (!posting) throw new Error('no posting')
    const message = applyPrompt(
      posting,
      { ...EMPTY_PROFILE, answers: bank },
      { mode: 'review', resumePath: '/x/resume.pdf' },
    )
    expect(message).toContain('- Notice period: 1 month')
    expect(message).not.toContain('Phone number:')
    expect(message).toContain('do not guess')
    expect(message).toContain('stop before the final submit button')
    expect(message).toContain('/x/resume.pdf')
    expect(
      applyPrompt(posting, EMPTY_PROFILE, { mode: 'automatic' }),
    ).toContain('submit the application')
  })
})

describe('the queue', () => {
  const app = (
    status: Application['status'],
    sentAt?: number,
  ): Application => ({
    id: String(Math.random()),
    posting: {
      title: 'Sr. Product Designer',
      company: 'Acme Robotics Inc.',
      description: '',
      url: 'x',
      source: 'page',
    },
    status,
    receipt: sentAt ? { fields: [], sentAt } : undefined,
    createdAt: 0,
    updatedAt: 0,
  })
  it('never applies twice to the same role, however it is written', () => {
    expect(
      dedupeKey({
        company: 'Acme Robotics Inc.',
        title: 'Sr. Product Designer',
      }),
    ).toBe(
      dedupeKey({ company: 'ACME ROBOTICS', title: 'Sr Product Designer' }),
    )
    if (!posting) throw new Error('no posting')
    const same = {
      ...posting,
      company: 'Acme Robotics Inc.',
      title: 'Sr. Product Designer',
    }
    expect(
      canQueue([app('queued')], same, {
        automatic: false,
        dailyCap: 10,
        now: 0,
      }),
    ).toBe('duplicate')
    expect(
      canQueue([app('skipped')], same, {
        automatic: false,
        dailyCap: 10,
        now: 0,
      }),
    ).toBeNull()
  })
  it('stops automatic sending at the daily cap', () => {
    if (!posting) throw new Error('no posting')
    const now = Date.UTC(2026, 9, 11, 12)
    const sent = [app('sent', now), app('sent', now)].map((a, i) => ({
      ...a,
      posting: { ...a.posting, title: `Role ${i}` },
    }))
    expect(canQueue(sent, posting, { automatic: true, dailyCap: 2, now })).toBe(
      'daily-cap',
    )
    expect(
      canQueue(sent, posting, { automatic: false, dailyCap: 2, now }),
    ).toBeNull()
  })
  it('job sites follow the browser language', () => {
    expect(jobRegionForLocale('ko-KR')).toBe('KR')
    expect(jobRegionForLocale('en-IN')).toBe('IN')
    expect(JOB_SITES.KR.map((s) => s.id)).toEqual([
      'wanted',
      'saramin',
      'jobkorea',
      'linkedin',
    ])
    expect(JOB_SITES.IN[0]?.search('Product Designer')).toBe(
      'https://www.naukri.com/product-designer-jobs',
    )
  })
})
