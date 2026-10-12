/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'bun:test'
import {
  atsNote,
  endsApplication,
  isChosenStage,
  movesStage,
  postsNote,
  splitName,
} from '../src/ats'

describe('ATS rules', () => {
  it('never a control that ends an application, in English or Korean', () => {
    for (const name of [
      'Reject',
      'Reject candidate',
      'Archive',
      'Disqualify',
      'Disposition',
      'Mark as hired',
      '불합격 처리',
      '탈락',
      '아카이브',
    ])
      expect(endsApplication(name)).toBe(true)
    for (const name of ['Add note', 'Save', 'Move stage', 'Phone Screen'])
      expect(endsApplication(name)).toBe(false)
  })

  it('a save is not a reject, and a stage move is recognised', () => {
    expect(postsNote('Save note')).toBe(true)
    expect(postsNote('저장')).toBe(true)
    expect(postsNote('Save and reject')).toBe(false)
    expect(movesStage('Move Stage')).toBe(true)
    expect(movesStage('단계 이동')).toBe(true)
    expect(movesStage('Add note')).toBe(false)
    expect(isChosenStage('Phone  screen', 'Phone Screen')).toBe(true)
    expect(isChosenStage('Onsite', 'Phone Screen')).toBe(false)
    expect(isChosenStage('anything', '')).toBe(false)
  })

  it('the note has what they meet, in their words, and no score', () => {
    const note = atsNote({
      roleTitle: 'Backend Engineer',
      profileUrl: 'https://www.linkedin.com/in/jiwon',
      criteria: [
        { id: 'c1', text: '5+ years', kind: 'must' },
        { id: 'c2', text: 'Kotlin', kind: 'nice' },
      ],
      evaluation: {
        criteriaVersion: 1,
        results: [
          {
            criterionId: 'c1',
            state: 'met',
            evidence: '2017 to now',
            by: 'device',
          },
          { criterionId: 'c2', state: 'missing', by: 'device' },
        ],
        met: 1,
        judged: 2,
        meetsEveryMust: true,
        suggestsSetAside: false,
      },
      locale: 'en',
      at: new Date(Date.UTC(2026, 9, 12)),
    })
    expect(note).toContain('Saved for Backend Engineer.')
    expect(note).toContain('- 5+ years ("2017 to now")')
    expect(note).not.toContain('Kotlin')
    expect(note).not.toMatch(/score|\d+%|1 of 2/i)
    expect(note).toContain('Saved by the recruiter')
    expect(
      atsNote({
        roleTitle: '백엔드 엔지니어',
        profileUrl: 'https://x',
        criteria: [],
        locale: 'ko',
        at: new Date(),
      }),
    ).toContain('관심 후보로 저장했어요')
  })

  it('splits a name for systems that need first and last', () => {
    expect(splitName('Jiwon Kim')).toEqual({ first: 'Jiwon', last: 'Kim' })
    expect(splitName('김지원')).toEqual({ first: '김지원', last: '-' })
  })
})
