/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Saving to the team's applicant tracking system (Recruit plan §4.4): the rules both paths share.
 *
 *   browser   the default for every ATS: the agent adds the note in the recruiter's own tab, and moves
 *             the stage only when the recruiter chose one. The stage-change guard holds it there.
 *   API       optional, per team: Greenhouse (Harvest v3), Lever and Ashby, with a connection key the
 *             team's admin gives. Adds the person as a prospect when they are not there, and the note.
 *
 * Reject, archive and disposition are never offered and never pressed, on either path.
 */

import type { Evaluation } from './evaluate'

export const ATS_IDS = ['greenhouse', 'lever', 'ashby', 'workday'] as const
export type AtsId = (typeof ATS_IDS)[number]

/** The systems with an API a team can connect. Workday is the browser, or a taught playbook. */
export const CONNECTABLE_ATS = ['greenhouse', 'lever', 'ashby'] as const
export type ConnectableAts = (typeof CONNECTABLE_ATS)[number]

export const ATS_NAMES: Record<AtsId, string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  workday: 'Workday',
}

/** Where each system's recruiter pages are. A browser run stays on these. */
export const ATS_HOSTS: Record<AtsId, string> = {
  greenhouse: 'greenhouse.io',
  lever: 'lever.co',
  ashby: 'ashbyhq.com',
  workday: 'myworkday.com',
}

export function isAtsId(value: string): value is AtsId {
  return (ATS_IDS as readonly string[]).includes(value)
}

export function isConnectable(value: string): value is ConnectableAts {
  return (CONNECTABLE_ATS as readonly string[]).includes(value)
}

/**
 * Controls that end someone's application. Redrob never presses one, in any mode: rejecting is the
 * recruiter's act, done by them in their ATS with their own reason.
 */
const ENDS_APPLICATION =
  /\b(reject|rejected|rejection|archive|archived|disqualif\w*|disposition\w*|decline candidate|not a fit|withdraw|mark as hired|move to hired)|불합격|탈락|불채용|보관 처리|보관함|아카이브|거절/i

export function endsApplication(name: string): boolean {
  return ENDS_APPLICATION.test(name)
}

/** A control that moves someone between stages, which only the recruiter's chosen stage may be. */
const MOVES_STAGE =
  /\b(move|advance|change stage|stage|next step|move forward)\b|단계|이동|전형/i

export function movesStage(name: string): boolean {
  return MOVES_STAGE.test(name)
}

/** Whether `name` is the control for the stage the recruiter chose ("Phone Screen"). */
export function isChosenStage(name: string, stage: string): boolean {
  const fold = (s: string) =>
    s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
  const want = fold(stage)
  return want.length > 0 && fold(name).includes(want)
}

/** A control that posts the note: Save, Add note, Post. */
const POSTS =
  /\b(save|add note|post|add|submit|create)\b|저장|등록|추가|작성 완료/i

export function postsNote(name: string): boolean {
  return POSTS.test(name) && !endsApplication(name)
}

/**
 * The note saved with the person: why they are on the role, in the recruiter's words and the
 * person's own (the quoted evidence), and that the recruiter chose to save them. No score, ever.
 */
export function atsNote(input: {
  roleTitle: string
  profileUrl: string
  evaluation?: Evaluation | null
  criteria: Array<{ id: string; text: string; kind: 'must' | 'nice' }>
  locale: string
  at: Date
}): string {
  const ko = input.locale.toLowerCase().startsWith('ko')
  const date = new Intl.DateTimeFormat(ko ? 'ko-KR' : 'en-GB', {
    dateStyle: 'medium',
  }).format(input.at)
  const met = (input.evaluation?.results ?? [])
    .filter((r) => r.state === 'met')
    .map((r) => {
      const criterion = input.criteria.find((c) => c.id === r.criterionId)
      if (!criterion) return null
      const quote = r.evidence ? ` ("${r.evidence.slice(0, 200)}")` : ''
      return `- ${criterion.text}${quote}`
    })
    .filter((line): line is string => Boolean(line))
  return [
    ko
      ? `${input.roleTitle} 포지션 관심 후보로 저장했어요.`
      : `Saved for ${input.roleTitle}.`,
    ...(met.length ? [ko ? '충족한 조건:' : 'What they meet:', ...met] : []),
    ko ? `프로필: ${input.profileUrl}` : `Profile: ${input.profileUrl}`,
    ko
      ? `${date}, 채용 담당자가 Redrob 인재 스카우트로 저장했어요.`
      : `Saved by the recruiter with Redrob Talent Scout, ${date}.`,
  ].join('\n')
}

/** First and last name, for systems that require both. A single name keeps it first, with "-" last. */
export function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2) return { first: parts[0] || name.trim(), last: '-' }
  return { first: parts.slice(0, -1).join(' '), last: parts.at(-1) as string }
}
