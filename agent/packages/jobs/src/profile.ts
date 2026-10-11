/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The job seeker's profile, on this computer: the résumé, the answer bank and what they are looking
 * for. Applications are filled from the answer bank only; a question it cannot answer is never guessed.
 */

export type ApplyMode = 'review' | 'batch' | 'automatic'

export interface Answer {
  id: string
  /** What the question asks, in the person's words: "Notice period". */
  question: string
  /** Other ways forms ask it: "When can you start?", "입사 가능일". */
  aliases: string[]
  answer: string
}

export interface Criterion {
  id: string
  text: string
  /** Must-haves decide; nice-to-haves only rank. */
  kind: 'must' | 'nice'
  /** Words that are evidence for it in a posting. */
  keywords: string[]
  /** Added by Redrob from the résumé, not by the person: shown as "My assumption". */
  inferred?: boolean
}

export interface JobProfile {
  version: 1
  /** File name of the résumé kept with the profile, when one was added. */
  resume?: { name: string; size: number; addedAt: number }
  answers: Answer[]
  criteria: Criterion[]
  mode: ApplyMode
  /** In automatic mode, at most this many applications are sent a day. */
  dailyCap: number
  /** Keywords for the search links, e.g. "product designer". */
  keywords: string
}

export const EMPTY_PROFILE: JobProfile = {
  version: 1,
  answers: [],
  criteria: [],
  mode: 'review',
  dailyCap: 10,
  keywords: '',
}

/** Questions every form asks, offered with empty answers so the bank starts useful. */
export const STARTER_QUESTIONS: Array<Omit<Answer, 'answer'>> = [
  {
    id: 'phone',
    question: 'Phone number',
    aliases: ['mobile', 'phone', '전화번호', '휴대폰', '연락처'],
  },
  {
    id: 'email',
    question: 'Email',
    aliases: ['email address', 'e-mail', '이메일'],
  },
  {
    id: 'linkedin',
    question: 'LinkedIn profile',
    aliases: ['linkedin url', 'linkedin'],
  },
  {
    id: 'authorised',
    question: 'Are you legally authorised to work in this country?',
    aliases: [
      'work authorization',
      'authorized to work',
      'right to work',
      '취업 비자',
      '근무 자격',
    ],
  },
  {
    id: 'sponsorship',
    question: 'Will you now or in the future require visa sponsorship?',
    aliases: ['sponsorship', 'visa', '비자 지원'],
  },
  {
    id: 'notice',
    question: 'Notice period',
    aliases: [
      'when can you start',
      'start date',
      'availability',
      '입사 가능일',
      '입사 가능 시기',
    ],
  },
  {
    id: 'salary',
    question: 'Expected salary',
    aliases: [
      'salary expectation',
      'desired salary',
      'compensation',
      'ctc',
      'expected ctc',
      '희망 연봉',
    ],
  },
  {
    id: 'current_salary',
    question: 'Current salary',
    aliases: ['current ctc', 'current compensation', '현재 연봉'],
  },
  {
    id: 'years',
    question: 'Years of experience',
    aliases: ['how many years', 'total experience', '경력 연수', '총 경력'],
  },
  {
    id: 'relocate',
    question: 'Are you willing to relocate?',
    aliases: ['relocation', '이주'],
  },
  {
    id: 'gender',
    question: 'Gender (voluntary)',
    aliases: ['gender', 'sex', '성별'],
  },
  {
    id: 'veteran',
    question: 'Veteran status (voluntary)',
    aliases: ['veteran', 'protected veteran', '보훈'],
  },
  {
    id: 'disability',
    question: 'Disability status (voluntary)',
    aliases: ['disability', '장애'],
  },
  {
    id: 'ethnicity',
    question: 'Race or ethnicity (voluntary)',
    aliases: ['race', 'ethnicity', 'hispanic'],
  },
]

/** Voluntary self-identification: if the person left it empty, the answer is "decline". */
export const VOLUNTARY = new Set([
  'gender',
  'veteran',
  'disability',
  'ethnicity',
])

export function starterAnswers(): Answer[] {
  return STARTER_QUESTIONS.map((q) => ({ ...q, answer: '' }))
}
