/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * A role's criteria: what a person must have, what is nice to have, and what is never used. A
 * criterion is either checked on this device from the record ("5+ years", "Go or Kotlin", "based in
 * Seoul") or judged by the model from what the person wrote ("built payment systems"), and the
 * recruiter confirms every one the model proposed before it counts ("My assumption").
 *
 * Criteria that name a protected trait, or a known proxy for one, are refused with the reason in
 * words. "Never use" is fixed and cannot be edited down.
 */

export type CriterionKind = 'must' | 'nice'

/** Checked on this device, on the real values. */
export type DeviceCheck =
  | { type: 'years'; min: number }
  | { type: 'skills'; any: string[] }
  | { type: 'location'; any: string[] }
  | { type: 'languages'; all: string[] }
  | { type: 'worked-at'; any: string[] }
  | { type: 'degree'; any: string[] }

export interface Criterion {
  id: string
  text: string
  kind: CriterionKind
  /** Present when the device can decide it; otherwise the model judges `text`. */
  check?: DeviceCheck
  /** Proposed by Redrob, not written by the recruiter: off until they confirm it. */
  inferred?: boolean
  confirmed?: boolean
}

export interface CriteriaSet {
  /** Goes up on every change, so each evaluation can say which rules it ran against. */
  version: number
  items: Criterion[]
}

/** Shown on every role, and not editable: what Talent Scout never looks at. */
export const NEVER_USE = [
  'age',
  'gender',
  'photo',
  'nationality',
  'marital-status',
  'family',
  'religion',
  'disability',
  'ethnicity',
  'school-name',
  'graduation-year',
  'gaps-for-family-or-military',
  'postcode-distance',
] as const

export type NeverUse = (typeof NEVER_USE)[number]

export type Refusal =
  | 'protected-trait'
  | 'age-proxy'
  | 'origin-proxy'
  | 'family-proxy'
  | 'distance-proxy'
  | 'school-name'

const REFUSALS: Array<{ reason: Refusal; pattern: RegExp }> = [
  {
    reason: 'protected-trait',
    pattern:
      /\b(male|female|man|woman|men|women|gender|sex|pregnan\w*|religio\w*|christian|muslim|jewish|hindu|buddhist|ethnic\w*|race|racial|caucasian|asian|hispanic|disab\w*|handicap\w*|married|unmarried|marital|sexual orientation|nationality|citizen of)\b|남성|여성|남자|여자|성별|임신|종교|기독교|불교|인종|민족|장애|기혼|미혼|결혼|국적/i,
  },
  {
    reason: 'age-proxy',
    pattern:
      /\b(young|younger|youthful|energetic young|under \d{2}|over \d{2}|aged? \d{2}|\d{2}\s*(?:-|to)\s*\d{2} years old|years old|recent (grad|graduate)s?|new grads? only|fresh graduates?|digital natives?|born (in|after|before)|graduat\w* (in|after|before) (19|20)\d{2}|class of (19|20)\d{2}|max(imum)? \d+ years? (of )?experience|no more than \d+ years)\b|젊은|어린|나이|세 이하|세 이상|세 미만|연령|\d{2}세|신입만|졸업 예정자만|\d{2}년생|년생 이후/i,
  },
  {
    reason: 'school-name',
    pattern:
      /\b(ivy league|top[- ]\d+ (school|university|universit\w*)|from (harvard|stanford|mit|oxford|cambridge|iit|seoul national|kaist|yonsei|korea university)|sky (university|graduates?))\b|명문대|스카이 ?출신|서울대 출신|SKY/i,
  },
  {
    reason: 'origin-proxy',
    pattern:
      /\b(native(-| )(english |korean |hindi )?speakers?|mother tongue|accent|local (only|candidates only)|born (and raised )?in)\b|원어민|모국어|억양|출신/i,
  },
  {
    reason: 'family-proxy',
    pattern:
      /\b(no (career )?gaps?|continuous employment|no children|no kids|without children|family (status|situation)|childcare|military service (completed|done)|군필)\b|공백 없|경력 단절|자녀|육아|군 ?필|병역 필/i,
  },
  {
    reason: 'distance-proxy',
    pattern:
      /\b(within \d+\s?(km|kilomet\w*|mi|miles?) of|zip ?codes?|post ?codes?|postal codes?|lives? (near|close to))\b|\d+\s?km 이내|우편번호|거주지 근처/i,
  },
]

/** Why a criterion's wording cannot be used, or null when it can. */
export function refuseCriterion(text: string): Refusal | null {
  for (const { reason, pattern } of REFUSALS) {
    if (pattern.test(text)) return reason
  }
  return null
}

/** The criteria that count: the recruiter's own, and the proposals they confirmed. */
export function activeCriteria(set: CriteriaSet): Criterion[] {
  return set.items.filter(
    (c) => (!c.inferred || c.confirmed) && refuseCriterion(c.text) === null,
  )
}

/** A new version with `change` applied; any refused criterion is left out. */
export function revise(
  set: CriteriaSet,
  items: Criterion[],
): {
  set: CriteriaSet
  refused: Array<{ criterion: Criterion; reason: Refusal }>
} {
  const refused: Array<{ criterion: Criterion; reason: Refusal }> = []
  const kept: Criterion[] = []
  for (const criterion of items) {
    const reason = refuseCriterion(criterion.text)
    if (reason) refused.push({ criterion, reason })
    else kept.push(criterion)
  }
  return { set: { version: set.version + 1, items: kept }, refused }
}

/**
 * Reads the device checks out of the recruiter's own words, where the words are plain enough to be
 * sure: "5+ years", "Go or Kotlin", "based in Seoul". Anything else is left for the model, with the
 * recruiter's words as the criterion.
 */
export function deviceCheckFor(text: string): DeviceCheck | undefined {
  const years =
    /(\d{1,2})\s*\+?\s*(?:or more\s+)?(?:years?|yrs?|년)\s*(?:이상)?/i.exec(
      text,
    )
  if (years && !/\b(max|maximum|no more|under|최대)\b/i.test(text)) {
    return { type: 'years', min: Number(years[1]) }
  }
  const location =
    /^(?:based in|located in|works? (?:from|in)|in)\s+(.+)$|^(.+?)\s*(?:근무|거주)$/i.exec(
      text.trim(),
    )
  if (location) {
    return {
      type: 'location',
      any: splitAlternatives(location[1] ?? location[2] ?? ''),
    }
  }
  const speaks =
    /^(?:speaks?|fluent in|business[- ]level)\s+(.+)$|^(.+?)\s*(?:가능|능통)$/i.exec(
      text.trim(),
    )
  if (
    speaks &&
    /english|korean|hindi|japanese|chinese|영어|한국어|일본어|중국어|힌디어/i.test(
      text,
    )
  ) {
    return {
      type: 'languages',
      all: splitAlternatives(speaks[1] ?? speaks[2] ?? ''),
    }
  }
  const worked = /^(?:has )?worked at (?:one of:?\s*)?(.+)$/i.exec(text.trim())
  if (worked)
    return { type: 'worked-at', any: splitAlternatives(worked[1] ?? '') }
  const skills =
    /^([A-Za-z0-9+#.\- ]{1,30})(?:\s+(?:or|\/)\s+[A-Za-z0-9+#.\- ]{1,30})+$/.exec(
      text.trim(),
    )
  if (skills) return { type: 'skills', any: splitAlternatives(text) }
  return undefined
}

function splitAlternatives(text: string): string[] {
  return text
    .split(/\s*(?:,|\/|\bor\b|\band\b|또는|이나|혹은)\s*/i)
    .map((s) => s.trim().replace(/\.$/, ''))
    .filter(Boolean)
}
