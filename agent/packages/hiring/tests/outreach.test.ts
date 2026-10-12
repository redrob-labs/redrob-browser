/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'bun:test'
import {
  automaticAllowed,
  draftPrompt,
  isPaidControl,
  sameMessage,
  timeZoneFor,
  withNotice,
} from '../src/outreach'

describe('outreach', () => {
  it('adds the notice once', () => {
    const notice = 'How I found you: your LinkedIn profile.'
    expect(withNotice('Hi', notice)).toBe(`Hi\n\n${notice}`)
    expect(withNotice(`Hi\n\n${notice}`, notice)).toBe(`Hi\n\n${notice}`)
  })

  it('gives the model only the role, the name and their own words', () => {
    const prompt = draftPrompt({
      role: { title: 'Backend Engineer', location: 'Seoul' },
      name: '[PERSON_1]',
      evidence: ['I build payment systems in Go'],
      language: 'ko',
    })
    expect(prompt).toContain('Role: Backend Engineer, Seoul')
    expect(prompt).toContain('- I build payment systems in Go')
  })

  it.each([
    ['Seoul', true],
    ['Remote, India', true],
    [null, true],
    ['New York, NY', false],
    ['London', false],
    ['Berlin, Germany', false],
    ['뉴욕', false],
  ])('Automatic in %s: %s', (place, allowed) => {
    expect(automaticAllowed(place)).toBe(allowed)
  })

  it('knows the controls that cost money', () => {
    expect(isPaidControl('Buy InMail credits')).toBe(true)
    expect(isPaidControl('Unlock CV')).toBe(true)
    expect(isPaidControl('이력서 열람')).toBe(true)
    expect(isPaidControl('Send')).toBe(false)
  })

  it('compares an approved message to what is typed, ignoring spacing only', () => {
    expect(
      sameMessage('Hi Jiwon,\n\nWe are hiring.', 'Hi Jiwon, We are hiring.'),
    ).toBe(true)
    expect(sameMessage('Hi Jiwon', 'Hi Jiwon, click this link')).toBe(false)
  })

  it('places quiet hours in the recipient’s zone, else the role’s', () => {
    expect(timeZoneFor(['Seoul, South Korea', 'London'], 'UTC')).toBe(
      'Asia/Seoul',
    )
    expect(timeZoneFor([undefined, 'Bengaluru'], 'UTC')).toBe('Asia/Kolkata')
    expect(timeZoneFor(['Mars'], 'Asia/Seoul')).toBe('Asia/Seoul')
  })
})

describe('the email guard', () => {
  const run = {
    connector: 'Gmail' as const,
    recipient: 'jiwon@example.com',
    body: 'Hi Jiwon,\n\nWe are hiring.',
  }
  const send = (body: Record<string, unknown>, server = 'Gmail') => ({
    server_name: server,
    category_name: 'GMAIL_EMAIL',
    action_name: 'gmail_send_email',
    body_schema: JSON.stringify(body),
  })
  it('lets discovery through and allows the one approved send', async () => {
    const { emailCallVerdict } = await import('../src/outreach')
    expect(
      emailCallVerdict('discover_server_categories_or_actions', {}, run),
    ).toEqual({ allow: true, sends: false })
    expect(
      emailCallVerdict(
        'execute_action',
        send({
          to: ['jiwon@example.com'],
          subject: 'Backend Engineer',
          body: '<p>Hi Jiwon,</p><p>We are hiring.</p>',
        }),
        run,
      ),
    ).toEqual({ allow: true, sends: true })
  })
  it('refuses another mailbox, another recipient, a cc, other text, and other actions', async () => {
    const { emailCallVerdict } = await import('../src/outreach')
    const body = 'Hi Jiwon,\n\nWe are hiring.'
    expect(
      emailCallVerdict(
        'execute_action',
        send({ to: 'jiwon@example.com', body }, 'Outlook Mail'),
        run,
      ).allow,
    ).toBe(false)
    expect(
      emailCallVerdict(
        'execute_action',
        send({ to: 'other@example.com', body }),
        run,
      ).allow,
    ).toBe(false)
    expect(
      emailCallVerdict(
        'execute_action',
        send({ to: 'jiwon@example.com', cc: 'boss@example.com', body }),
        run,
      ).allow,
    ).toBe(false)
    expect(
      emailCallVerdict(
        'execute_action',
        send({ to: 'jiwon@example.com', body: 'Hi Jiwon, click here' }),
        run,
      ).allow,
    ).toBe(false)
    expect(
      emailCallVerdict(
        'execute_action',
        { server_name: 'Gmail', action_name: 'gmail_delete_email' },
        run,
      ).allow,
    ).toBe(false)
  })
})
