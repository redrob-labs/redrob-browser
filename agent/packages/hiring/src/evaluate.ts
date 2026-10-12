/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * How one person measures against a role, criterion by criterion, each with what the judgement rests
 * on. The design system's MatchBreakdown rules hold: "No evidence either way" is left out of the
 * count, never counted against anyone, and the verdict is "Meets n of m" with no hidden score.
 *
 * Two sources of judgement, kept apart:
 *   * device checks, on the real values in the record (years from dated roles, a skills list);
 *   * the model's, on what the person wrote, accepted only with a quote that really is in their
 *     words. A quote that is not a substring of the source is discarded and the state becomes
 *     unknown, so a model cannot invent evidence for or against anyone.
 */

import type { Candidate, Position } from './candidate'
import type { Criterion, DeviceCheck } from './criteria'

export type MatchState = 'met' | 'partly' | 'missing' | 'unknown'

export interface CriterionResult {
  criterionId: string
  state: MatchState
  /** The person's own words, or the record's fact ("2019 to now, Payments backend at …"). */
  evidence?: string
  /** Who judged it: the device on the record, or the model on the person's text. */
  by: 'device' | 'model'
}

export interface Evaluation {
  criteriaVersion: number
  results: CriterionResult[]
  /** Met, counted over criteria with evidence either way. */
  met: number
  judged: number
  /** Every must have met with evidence: the only people Automatic may contact. */
  meetsEveryMust: boolean
  /** A must have the evidence says is missing: a suggestion the recruiter confirms, never an outcome. */
  suggestsSetAside: boolean
}

/** What a person wrote, as one text: what model quotes are checked against. */
export function candidateText(candidate: Candidate): string {
  return [
    candidate.headline,
    candidate.about,
    ...candidate.positions.flatMap((p) => [
      [p.title, p.organisation].filter(Boolean).join(' at '),
      p.description,
    ]),
    candidate.skills.length ? candidate.skills.join(', ') : undefined,
  ]
    .filter(Boolean)
    .join('\n')
}

const fold = (s: string) =>
  s
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u201C\u201D"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/** Whether `quote` is really in `source`, ignoring case, quotes and spacing. Short quotes prove nothing. */
export function quoteIsInSource(quote: string, source: string): boolean {
  const q = fold(quote)
  return q.length >= 3 && fold(source).includes(q)
}

/** A month index. A year alone is January as a start and December as an end: the whole year. */
function monthOf(
  value: string | undefined,
  edge: 'start' | 'end',
): number | undefined {
  if (!value) return undefined
  const m = /^(\d{4})(?:-(\d{1,2}))?/.exec(value)
  if (!m) return undefined
  return Number(m[1]) * 12 + (m[2] ? Number(m[2]) - 1 : edge === 'end' ? 11 : 0)
}

/** Months covered by dated roles, overlaps counted once. Undefined when no role is dated. */
export function monthsOfExperience(
  positions: readonly Position[],
  now: Date,
): number | undefined {
  const nowMonth = now.getUTCFullYear() * 12 + now.getUTCMonth()
  const spans = positions
    .map((p) => {
      const start = monthOf(p.start, 'start')
      const end = p.current ? nowMonth : monthOf(p.end, 'end')
      return start !== undefined && end !== undefined && end >= start
        ? ([start, end + 1] as const)
        : null
    })
    .filter((s): s is readonly [number, number] => s !== null)
    .sort((a, b) => a[0] - b[0])
  if (!spans.length) return undefined
  let total = 0
  let [from, to] = spans[0] as readonly [number, number]
  for (const [start, end] of spans.slice(1)) {
    if (start <= to) to = Math.max(to, end)
    else {
      total += to - from
      from = start
      to = end
    }
  }
  return total + (to - from)
}

const includesWord = (haystack: string, needle: string) => {
  const n = fold(needle)
  if (!n) return false
  const h = fold(haystack)
  // Short tokens ("Go", "C") must be whole words, or "Google" would mean Go.
  return n.length <= 3
    ? new RegExp(
        `(^|[^a-z0-9+#])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9+#])`,
      ).test(h)
    : h.includes(n)
}

function years(n: number): string {
  const y = Math.floor(n / 12)
  return y === 1 ? '1 year' : `${y} years`
}

export function checkOnDevice(
  check: DeviceCheck,
  candidate: Candidate,
  now: Date,
): Omit<CriterionResult, 'criterionId' | 'by'> {
  switch (check.type) {
    case 'years': {
      const months = monthsOfExperience(candidate.positions, now)
      if (months === undefined) return { state: 'unknown' }
      const dated = candidate.positions.filter((p) => p.start)
      const evidence = `${years(months)} in dated roles: ${dated
        .slice(0, 3)
        .map(
          (p) => `${p.start}–${p.current ? 'now' : (p.end ?? '?')} ${p.title}`,
        )
        .join('; ')}`
      if (months >= check.min * 12) return { state: 'met', evidence }
      // Every role dated and still short: the record says so. Otherwise some roles are undated.
      return dated.length === candidate.positions.length
        ? { state: 'missing', evidence }
        : { state: 'unknown' }
    }
    case 'skills': {
      const text = candidateText(candidate)
      const listed = candidate.skills.find((s) =>
        check.any.some((a) => fold(s) === fold(a)),
      )
      if (listed) return { state: 'met', evidence: `Skills: ${listed}` }
      const named = check.any.find((a) => includesWord(text, a))
      if (named) {
        const line = text.split('\n').find((l) => includesWord(l, named))
        return { state: 'met', evidence: line?.slice(0, 200) }
      }
      return { state: 'unknown' }
    }
    case 'location': {
      const at = candidate.location
      if (at && check.any.some((place) => includesWord(at, place))) {
        return { state: 'met', evidence: `Location: ${at}` }
      }
      // Living elsewhere says nothing about whether they would work there.
      return { state: 'unknown' }
    }
    case 'languages': {
      const all = check.all.every((l) =>
        candidate.languages.some((k) => includesWord(k, l)),
      )
      return all
        ? {
            state: 'met',
            evidence: `Languages: ${candidate.languages.join(', ')}`,
          }
        : { state: 'unknown' }
    }
    case 'worked-at': {
      const at = candidate.positions.find(
        (p) =>
          p.organisation &&
          check.any.some((o) => includesWord(p.organisation ?? '', o)),
      )
      return at
        ? { state: 'met', evidence: `${at.title} at ${at.organisation}` }
        : { state: 'unknown' }
    }
    case 'degree': {
      const has = candidate.education.find((e) =>
        check.any.some((d) =>
          includesWord(`${e.degree ?? ''} ${e.field ?? ''}`, d),
        ),
      )
      // The degree, never the school: the school's name is not evidence of anything here.
      return has
        ? {
            state: 'met',
            evidence: [has.degree, has.field].filter(Boolean).join(', '),
          }
        : { state: 'unknown' }
    }
  }
}

/** What the model said about one criterion, before it is checked. */
export interface ModelJudgement {
  criterionId: string
  state: MatchState
  quote?: string
}

export function evaluate(
  candidate: Candidate,
  criteria: { version: number; items: readonly Criterion[] },
  model: readonly ModelJudgement[],
  now: Date,
): Evaluation {
  const source = candidateText(candidate)
  const results = criteria.items.map((criterion): CriterionResult => {
    if (criterion.check) {
      return {
        criterionId: criterion.id,
        by: 'device',
        ...checkOnDevice(criterion.check, candidate, now),
      }
    }
    const said = model.find((m) => m.criterionId === criterion.id)
    if (!said || said.state === 'unknown') {
      return { criterionId: criterion.id, by: 'model', state: 'unknown' }
    }
    // Any judgement either way needs the person's own words behind it.
    if (!said.quote || !quoteIsInSource(said.quote, source)) {
      return { criterionId: criterion.id, by: 'model', state: 'unknown' }
    }
    return {
      criterionId: criterion.id,
      by: 'model',
      state: said.state,
      evidence: said.quote.slice(0, 300),
    }
  })
  const judged = results.filter((r) => r.state !== 'unknown').length
  const met = results.filter((r) => r.state === 'met').length
  const musts = criteria.items.filter((c) => c.kind === 'must')
  const stateOf = (id: string) =>
    results.find((r) => r.criterionId === id)?.state
  return {
    criteriaVersion: criteria.version,
    results,
    met,
    judged,
    meetsEveryMust:
      musts.length > 0 && musts.every((c) => stateOf(c.id) === 'met'),
    suggestsSetAside: musts.some((c) => stateOf(c.id) === 'missing'),
  }
}

/**
 * The order the People list uses: must haves met with evidence, then when they were found. There is
 * no score, and nothing a model is unsure of moves anyone down.
 */
export function compareForList(
  a: {
    evaluation: Evaluation
    foundAt: number
    criteria: readonly Criterion[]
  },
  b: {
    evaluation: Evaluation
    foundAt: number
    criteria: readonly Criterion[]
  },
): number {
  const musts = (x: typeof a) =>
    x.evaluation.results.filter(
      (r) =>
        r.state === 'met' &&
        x.criteria.find((c) => c.id === r.criterionId)?.kind === 'must',
    ).length
  return musts(b) - musts(a) || b.foundAt - a.foundAt
}
