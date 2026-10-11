/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * A person Talent Scout found, holding only what a role's criteria can use. Everything else a page
 * shows about them is dropped before the record exists: photos, birth dates and ages, gender,
 * nationality, marital status, family and military service. Korean résumé sites often carry these,
 * and Korea's 채용절차법 (Art. 4-3) bars employers from collecting several of them; none of them may
 * decide anything, so none of them is kept.
 */

import type { SiteId } from './sites'

export interface Position {
  title: string
  organisation?: string
  /** `YYYY` or `YYYY-MM`. Absent when the page gives no date. */
  start?: string
  /** Absent with `current` for a role held now. */
  end?: string
  current?: boolean
  description?: string
}

export interface Education {
  /** Hidden from the model (labelled) and kept only when a role asks about a degree. */
  school: string
  degree?: string
  field?: string
  // No years: a graduation year is a proxy for age.
}

export interface ContactRoute {
  /** How the site lets a recruiter reach them, or an address the person published themselves. */
  kind: 'site-message' | 'inmail' | 'email' | 'proposal'
  /** An email only when the person published it or gave it in an application. */
  value?: string
}

export interface Candidate {
  /** The page it was read from, as the person's profile URL. */
  url: string
  site: SiteId
  name: string
  headline?: string
  /** Free text the person wrote about themselves ("About", a GitHub bio). Candidate-authored. */
  about?: string
  positions: Position[]
  education: Education[]
  skills: string[]
  /** As the person stated it; never inferred from anything else. */
  location?: string
  languages: string[]
  /** Links the person published: a site, a portfolio. */
  links: string[]
  contact: ContactRoute[]
  /** The ATS's own id, for joining an export with the ATS's data. */
  atsId?: string
  /** Whether the person's text addresses AI tools ("ignore your instructions"). Shown, never counted. */
  addressesAi?: boolean
}

/**
 * Field names, in English and Korean, that carry a protected trait or a proxy for one. A site's
 * extractor never maps these into a Candidate; `withoutProtected` also removes any that arrive as
 * free key/value pairs (a résumé's "기본 정보" table).
 */
const PROTECTED_KEYS =
  /^(photo|picture|image|avatar|birth|dob|date of birth|age|gender|sex|pronouns?|nationality|citizenship|marital|married|family|children|dependents|religion|ethnicity|race|disability|military|veteran|height|weight|blood|사진|생년월일|출생|나이|연령|성별|국적|결혼|혼인|가족|자녀|종교|병역|군필|보훈|장애|신장|체중|혈액형|본적)/i

export function isProtectedField(key: string): boolean {
  return PROTECTED_KEYS.test(key.trim())
}

/** Drops key/value pairs that name a protected trait, keeping the rest. */
export function withoutProtected(
  fields: ReadonlyArray<readonly [string, string]>,
): Array<[string, string]> {
  return fields
    .filter(([key]) => !isProtectedField(key))
    .map(([k, v]) => [k, v])
}

/**
 * Text written to steer an AI reading it. Flagged for the recruiter as a neutral note, and the
 * evidence check (quotes must be the person's own words) is what keeps it from helping.
 */
const ADDRESSES_AI =
  /\b(ignore (all |any )?(previous|prior|your) instructions|you are an? (ai|assistant|language model)|as an ai|rate (me|this candidate) (highly|as)|system prompt|recruit(er|ing) (ai|bot)s?:?)\b|(이전|모든) 지시(를|사항을)? 무시/i

export function addressesAi(text: string): boolean {
  return ADDRESSES_AI.test(text)
}

const clean = (s: string | undefined) =>
  s?.replace(/\s+/g, ' ').trim() || undefined

/** The record as stored: trimmed, de-duplicated, capped, with the AI note set. */
export function normaliseCandidate(candidate: Candidate): Candidate {
  const uniq = (list: string[]) => [
    ...new Map(
      list
        .map((s) => s.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .map((s) => [s.toLowerCase(), s] as const),
    ).values(),
  ]
  const about = clean(candidate.about)?.slice(0, 4_000)
  const text = [
    candidate.headline,
    about,
    ...candidate.positions.map((p) => p.description ?? ''),
  ].join('\n')
  return {
    url: candidate.url,
    site: candidate.site,
    name: clean(candidate.name) ?? '',
    headline: clean(candidate.headline),
    about,
    positions: candidate.positions.slice(0, 40).map((p) => ({
      title: clean(p.title) ?? '',
      organisation: clean(p.organisation),
      start: p.start,
      end: p.current ? undefined : p.end,
      current: p.current || undefined,
      description: clean(p.description)?.slice(0, 2_000),
    })),
    education: candidate.education.slice(0, 10).map((e) => ({
      school: clean(e.school) ?? '',
      degree: clean(e.degree),
      field: clean(e.field),
    })),
    skills: uniq(candidate.skills).slice(0, 100),
    location: clean(candidate.location),
    languages: uniq(candidate.languages).slice(0, 20),
    links: uniq(candidate.links).slice(0, 20),
    contact: candidate.contact,
    atsId: candidate.atsId,
    addressesAi: addressesAi(text) || undefined,
  }
}
