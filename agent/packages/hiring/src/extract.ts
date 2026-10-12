/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Reading a person from the page the recruiter has open. Deterministic first: a site's own markup
 * (LinkedIn's public profile, GitHub's vcard), then schema.org `Person` data on any page. When none of
 * them finds a person on a page that is plainly a profile, the outcome is `none` and the server may
 * ask the model to read the page's visible text instead (5.3), recording that it did.
 *
 * Photos are never read. Nor is anything the Candidate type has no field for.
 */

import { parseHTML } from 'linkedom'
import {
  type Candidate,
  type Education,
  normaliseCandidate,
  type Position,
} from './candidate'
import { recognisePage, type SiteId } from './sites'

export type ExtractOutcome =
  | { status: 'ok'; candidates: Candidate[] }
  | { status: 'none' }
  | { status: 'sign-in' }
  | { status: 'blocked' }

type Doc = ReturnType<typeof parseHTML>['document']

function parseDocument(html: string): Doc {
  return parseHTML(html).document
}

const text = (el: { textContent: string | null } | null | undefined) =>
  el?.textContent?.replace(/\s+/g, ' ').trim() || undefined

function jsonLd(doc: Doc): unknown[] {
  const out: unknown[] = []
  for (const script of doc.querySelectorAll(
    'script[type="application/ld+json"]',
  )) {
    try {
      const value = JSON.parse(script.textContent ?? '')
      const items = Array.isArray(value) ? value : [value]
      for (const item of items) {
        out.push(item)
        if (item && typeof item === 'object' && Array.isArray(item['@graph'])) {
          out.push(...item['@graph'])
        }
      }
    } catch {
      // A page's broken JSON-LD is not the person's fault; the DOM may still have them.
    }
  }
  return out
}

type LdWork = {
  name?: string
  member?: { startDate?: number | string; endDate?: number | string }
}

type LdPerson = {
  '@type'?: string | string[]
  name?: string
  description?: string
  jobTitle?: string | string[]
  address?: { addressLocality?: string; addressCountry?: string } | string
  worksFor?: LdWork[] | LdWork
  alumniOf?: Array<{ name?: string; '@type'?: string }>
  knowsLanguage?: Array<string | { name?: string }>
  sameAs?: string | string[]
  url?: string
  email?: string
}

const isPerson = (x: unknown): x is LdPerson => {
  if (!x || typeof x !== 'object') return false
  const type = (x as LdPerson)['@type']
  return type === 'Person' || (Array.isArray(type) && type.includes('Person'))
}

const year = (v: number | string | undefined) =>
  v === undefined || v === '' ? undefined : String(v).slice(0, 7)

function fromLd(person: LdPerson, url: string, site: SiteId): Candidate {
  const works = Array.isArray(person.worksFor)
    ? person.worksFor
    : person.worksFor
      ? [person.worksFor]
      : []
  const titles = Array.isArray(person.jobTitle)
    ? person.jobTitle
    : person.jobTitle
      ? [person.jobTitle]
      : []
  const positions: Position[] = works.map((w, i) => ({
    title: titles[i] ?? '',
    organisation: w.name?.trim(),
    start: year(w.member?.startDate),
    end: year(w.member?.endDate),
    current: w.member?.endDate === undefined,
  }))
  const address =
    typeof person.address === 'string'
      ? person.address
      : person.address?.addressLocality
  const sameAs = Array.isArray(person.sameAs)
    ? person.sameAs
    : person.sameAs
      ? [person.sameAs]
      : []
  return {
    url,
    site,
    name: person.name ?? '',
    about: person.description,
    positions,
    education: (person.alumniOf ?? [])
      .filter((a) => a.name)
      .map((a): Education => ({ school: a.name ?? '' })),
    skills: [],
    location: address,
    languages: (person.knowsLanguage ?? [])
      .map((l) => (typeof l === 'string' ? l : (l.name ?? '')))
      .filter(Boolean),
    links: sameAs.filter((l) => l !== url),
    contact: person.email
      ? [{ kind: 'email', value: person.email.replace(/^mailto:/, '') }]
      : [],
  }
}

/** `2019 - Present`, `Mar 2019 - Jan 2022`, `2019년 3월 - 현재` → start, end, current. */
export function parseDateRange(
  range: string,
): Pick<Position, 'start' | 'end' | 'current'> {
  const months: Record<string, number> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  }
  const point = (s: string): string | undefined => {
    const en = /([A-Za-z]{3})[a-z]*\.?\s+(\d{4})/.exec(s)
    if (en) {
      const m = months[(en[1] ?? '').toLowerCase()]
      return m ? `${en[2]}-${String(m).padStart(2, '0')}` : en[2]
    }
    const ko = /(\d{4})\s*[년.\-/]\s*(\d{1,2})/.exec(s)
    if (ko) return `${ko[1]}-${String(Number(ko[2])).padStart(2, '0')}`
    return /(\d{4})/.exec(s)?.[1]
  }
  const [from = '', to = ''] = range.split(/\s+[-–~]\s+|\s*[–~]\s*/)
  const current = /present|now|current|현재|재직/i.test(to)
  return {
    start: point(from),
    end: current ? undefined : point(to),
    current: current || undefined,
  }
}

function linkedInDom(doc: Doc, base: Candidate): Candidate {
  const positions: Position[] = []
  for (const item of doc.querySelectorAll(
    'li.experience-item, li.profile-section-card.experience-group-position',
  )) {
    const title = text(item.querySelector('.experience-item__title'))
    if (!title) continue
    const range = text(item.querySelector('.date-range'))?.replace(
      /\s*·?\s*\d+\s*(yrs?|years?|mos?|months?).*$/i,
      '',
    )
    positions.push({
      title,
      organisation: text(item.querySelector('.experience-item__subtitle')),
      ...(range ? parseDateRange(range) : {}),
      description: text(
        item.querySelector(
          '.show-more-less-text__text--less, .experience-item__description',
        ),
      ),
    })
  }
  const education: Education[] = []
  for (const item of doc.querySelectorAll('li.education__list-item')) {
    const school = text(item.querySelector('h3'))
    if (!school) continue
    const lines = [...item.querySelectorAll('h4 span')]
      .map((s) => text(s))
      .filter(Boolean) as string[]
    education.push({ school, degree: lines[0], field: lines[1] })
  }
  const languages = [
    ...doc.querySelectorAll(
      'section.languages li h3, [data-section="languages"] li h3',
    ),
  ]
    .map((h) => text(h))
    .filter(Boolean) as string[]
  return {
    ...base,
    name: text(doc.querySelector('.top-card-layout__title')) ?? base.name,
    headline:
      text(doc.querySelector('.top-card-layout__headline')) ?? base.headline,
    about:
      text(
        doc.querySelector(
          '[data-section="summary"] .core-section-container__content',
        ),
      ) ?? base.about,
    location:
      text(
        doc.querySelector(
          '.top-card-layout__first-subline .profile-info-subheader span',
        ),
      ) ?? base.location,
    // The markup's roles carry dates and organisations together; prefer them to JSON-LD's.
    positions: positions.length ? positions : base.positions,
    education: education.length ? education : base.education,
    languages: languages.length ? languages : base.languages,
  }
}

function github(doc: Doc, url: string): Candidate | null {
  const name = text(doc.querySelector('[itemprop="name"]'))
  const handle = text(doc.querySelector('[itemprop="additionalName"]'))
  if (!name && !handle) return null
  const org = doc.querySelector('[itemprop="worksFor"]')
  const organisation =
    org?.getAttribute('aria-label')?.replace(/^Organization:\s*/, '') ??
    text(org)
  const home = doc.querySelector('[itemprop="homeLocation"]')
  const location =
    home?.getAttribute('aria-label')?.replace(/^Home location:\s*/, '') ??
    text(home)
  const languages = [
    ...doc.querySelectorAll('[itemprop="programmingLanguage"]'),
  ]
    .map((el) => text(el))
    .filter(Boolean) as string[]
  const links = [
    ...doc.querySelectorAll(
      '[itemprop="url"] a, li[data-test-selector="profile-website-url"] a, a[rel~="me"]',
    ),
  ]
    .map((a) => a.getAttribute('href') ?? '')
    .filter((h) => /^https?:\/\//.test(h))
  const email = doc.querySelector('[itemprop="email"] a')?.getAttribute('href')
  const pinned = [...doc.querySelectorAll('.pinned-item-list-item-content')]
    .map((el) => {
      const repo = text(el.querySelector('a .repo, span.repo'))
      const about = text(el.querySelector('.pinned-item-desc'))
      return repo ? `${repo}${about ? `: ${about}` : ''}` : ''
    })
    .filter(Boolean)
  return {
    url,
    site: 'github',
    name: name ?? handle ?? '',
    headline: handle ? `@${handle}` : undefined,
    about:
      [text(doc.querySelector('.user-profile-bio')), ...pinned]
        .filter(Boolean)
        .join('\n') || undefined,
    positions: organisation ? [{ title: '', organisation, current: true }] : [],
    education: [],
    // Pinned repositories' languages are what they build in: a skill, not a spoken language.
    skills: languages,
    location,
    languages: [],
    links,
    // Published by the person on their own profile, so usable; GitHub's terms still bar spam (plan §6).
    contact: email?.startsWith('mailto:')
      ? [{ kind: 'email', value: email.slice(7) }]
      : [],
  }
}

const SIGN_IN =
  /\b(sign in to (view|see)|join to view|log ?in to continue|authwall)\b|로그인(이|을)? 필요|로그인 후/i

export function extractPage(html: string, url: string): ExtractOutcome {
  const page = recognisePage(url)
  const doc = parseDocument(html)
  const site: SiteId = page?.site.id ?? 'linkedin'
  const title = text(doc.querySelector('title')) ?? ''
  if (
    /\/(authwall|login|checkpoint)\b/.test(url) ||
    (SIGN_IN.test(title) && !doc.querySelector('.top-card-layout__title'))
  ) {
    return { status: 'sign-in' }
  }
  if (/captcha|unusual traffic|security verification|보안 문자/i.test(title))
    return { status: 'blocked' }

  if (page?.site.id === 'github') {
    const person = github(doc, url)
    return person
      ? { status: 'ok', candidates: [normaliseCandidate(person)] }
      : { status: 'none' }
  }

  const people = jsonLd(doc).filter(isPerson)
  // On a profile, the person the page is about: the one whose url is the page, else the first.
  const main =
    people.find((p) => p.url && normalise(p.url) === normalise(url)) ??
    (page?.kind === 'profile' || page?.kind === 'applicant'
      ? people[0]
      : undefined)

  if (page?.site.id === 'linkedin' && page.kind === 'profile') {
    const base = main
      ? fromLd(main, url, site)
      : {
          url,
          site,
          name: '',
          positions: [],
          education: [],
          skills: [],
          languages: [],
          links: [],
          contact: [],
        }
    const person = linkedInDom(doc, base)
    return person.name
      ? { status: 'ok', candidates: [normaliseCandidate(person)] }
      : { status: 'none' }
  }
  if (main)
    return {
      status: 'ok',
      candidates: [normaliseCandidate(fromLd(main, url, site))],
    }
  return { status: 'none' }
}

function normalise(u: string): string {
  return u
    .replace(/^https?:\/\/(www\.)?/, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .toLowerCase()
}

/**
 * The people a list page links to (a Recruiter search, a project, a Greenhouse or Saramin applicant
 * list): every link on the page that is a profile or applicant page Talent Scout recognises, in page
 * order, once each. Only what the recruiter can see on the open page; nothing beyond it is fetched.
 */
export function extractListUrls(
  html: string,
  pageUrl: string,
  limit = 100,
): string[] {
  const doc = parseDocument(html)
  const seen = new Set<string>()
  const out: string[] = []
  for (const a of doc.querySelectorAll('a[href]')) {
    let href: string
    try {
      href = new URL(a.getAttribute('href') ?? '', pageUrl).toString()
    } catch {
      continue
    }
    // Tracking parameters and fragments make the same person look like two.
    const clean = href.replace(/[?#].*$/, '').replace(/\/+$/, '')
    const page = recognisePage(clean)
    if (!page || (page.kind !== 'profile' && page.kind !== 'applicant'))
      continue
    if (
      clean === pageUrl.replace(/[?#].*$/, '').replace(/\/+$/, '') ||
      seen.has(clean)
    )
      continue
    seen.add(clean)
    out.push(clean)
    if (out.length >= limit) break
  }
  return out
}
