/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The sites Talent Scout knows: which of their pages are a profile, a list of people, an applicant or
 * a list of applicants, whether the site carries messages, and how much may be read and sent there a
 * day. Recognising a page is enough for the side panel to offer a chip; reading it is each site's
 * extractor (extract/).
 */

export type SiteId =
  | 'linkedin'
  | 'linkedin-recruiter'
  | 'github'
  | 'wanted'
  | 'saramin'
  | 'jobkorea'
  | 'remember'
  | 'naukri-rms'
  | 'foundit'
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'workday'

export type PageKind =
  | 'profile'
  | 'people-list'
  | 'applicant'
  | 'applicant-list'

export interface SiteLimits {
  /** Pages read a day, and the jittered gap between two. */
  readsPerDay: number
  readGapMs: [number, number]
  /** Messages sent a day through the site's own channel. 0 when it carries none. */
  messagesPerDay: number
  /** Connection or follow requests a day, where the site has them. */
  requestsPerDay?: number
}

export interface Site {
  id: SiteId
  name: string
  region: 'KR' | 'IN' | 'US' | 'any'
  pages: Array<{ kind: PageKind; url: RegExp }>
  send: 'message' | 'inmail' | 'proposal' | 'none'
  /** The applicant tracking systems: where a shortlist is saved back to. */
  ats?: boolean
  limits: SiteLimits
}

/** 4 to 12 seconds between two pages on one site: a person working, not a crawler (plan §4.1). */
const PACE: [number, number] = [4_000, 12_000]

const board = (
  id: SiteId,
  name: string,
  region: Site['region'],
  pages: Site['pages'],
  send: Site['send'] = 'proposal',
): Site => ({
  id,
  name,
  region,
  pages,
  send,
  limits: { readsPerDay: 150, readGapMs: PACE, messagesPerDay: 20 },
})

const ats = (id: SiteId, name: string, pages: Site['pages']): Site => ({
  id,
  name,
  region: 'any',
  pages,
  send: 'none',
  ats: true,
  limits: { readsPerDay: 300, readGapMs: [2_000, 6_000], messagesPerDay: 0 },
})

export const SITES: readonly Site[] = [
  {
    id: 'linkedin-recruiter',
    name: 'LinkedIn Recruiter',
    region: 'any',
    pages: [
      {
        kind: 'profile',
        url: /^https:\/\/www\.linkedin\.com\/talent\/.*\/profile\//,
      },
      {
        kind: 'people-list',
        url: /^https:\/\/www\.linkedin\.com\/talent\/(search|hire\/.*\/manage)/,
      },
    ],
    send: 'inmail',
    limits: {
      readsPerDay: 200,
      readGapMs: PACE,
      messagesPerDay: 25,
      requestsPerDay: 15,
    },
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    region: 'any',
    pages: [
      {
        kind: 'profile',
        url: /^https:\/\/([a-z]{2,3}\.|www\.)?linkedin\.com\/in\/[^/?#]+/,
      },
      {
        kind: 'people-list',
        url: /^https:\/\/www\.linkedin\.com\/search\/results\/people/,
      },
    ],
    send: 'message',
    limits: {
      readsPerDay: 100,
      readGapMs: PACE,
      messagesPerDay: 25,
      requestsPerDay: 15,
    },
  },
  {
    id: 'github',
    name: 'GitHub',
    region: 'any',
    // A user page only: /owner/repo and GitHub's own sections are not people.
    pages: [
      {
        kind: 'profile',
        url: /^https:\/\/github\.com\/(?!(?:orgs|topics|features|settings|marketplace|explore|search|about|pricing|enterprise|sponsors|login|signup|notifications|issues|pulls|collections|trending|apps|codespaces|copilot)(?:[/?#]|$))[A-Za-z0-9-]{1,39}\/?(?:[?#].*)?$/,
      },
    ],
    // GitHub's Acceptable Use Policies bar using its data for unsolicited email (plan §6).
    send: 'none',
    limits: { readsPerDay: 200, readGapMs: PACE, messagesPerDay: 0 },
  },
  board('wanted', 'Wanted', 'KR', [
    {
      kind: 'profile',
      url: /^https:\/\/www\.wanted\.co\.kr\/(dashboard\/)?(talent|resume|matchup)\/.+/,
    },
    {
      kind: 'applicant-list',
      url: /^https:\/\/www\.wanted\.co\.kr\/dashboard\/(recruitment|applicants)/,
    },
  ]),
  board('saramin', 'Saramin', 'KR', [
    {
      kind: 'applicant',
      url: /^https:\/\/www\.saramin\.co\.kr\/zf_user\/(memcom\/)?(resume|talent)/,
    },
    {
      kind: 'applicant-list',
      url: /^https:\/\/www\.saramin\.co\.kr\/zf_user\/memcom\/(applicant|recruit)/,
    },
  ]),
  board('jobkorea', 'JobKorea', 'KR', [
    {
      kind: 'applicant',
      url: /^https:\/\/www\.jobkorea\.co\.kr\/Corp\/(Person|Applicant)\/.+/i,
    },
    {
      kind: 'applicant-list',
      url: /^https:\/\/www\.jobkorea\.co\.kr\/Corp\/(GiMng|Applicant)/i,
    },
  ]),
  board('remember', 'Remember', 'KR', [
    {
      kind: 'profile',
      url: /^https:\/\/career\.rememberapp\.co\.kr\/.*\/(profile|talent)\//,
    },
    {
      kind: 'people-list',
      url: /^https:\/\/career\.rememberapp\.co\.kr\/.*\/(search|talents)/,
    },
  ]),
  board(
    'naukri-rms',
    'Naukri RMS',
    'IN',
    [
      {
        kind: 'applicant',
        url: /^https:\/\/(rms|resdex)\.naukri\.com\/.*(profile|cv|resume)/i,
      },
      {
        kind: 'applicant-list',
        url: /^https:\/\/rms\.naukri\.com\/.*(applies|applicants|response)/i,
      },
    ],
    'message',
  ),
  board(
    'foundit',
    'foundit',
    'IN',
    [
      {
        kind: 'applicant',
        url: /^https:\/\/recruiter\.foundit\.in\/.*(profile|resume)/i,
      },
      {
        kind: 'applicant-list',
        url: /^https:\/\/recruiter\.foundit\.in\/.*(applies|applicants|search)/i,
      },
    ],
    'message',
  ),
  ats('greenhouse', 'Greenhouse', [
    {
      kind: 'applicant',
      url: /^https:\/\/[a-z0-9-]+\.greenhouse\.io\/people\/\d+/,
    },
    {
      kind: 'applicant-list',
      url: /^https:\/\/[a-z0-9-]+\.greenhouse\.io\/(plans\/\d+\/candidates|people\?)/,
    },
  ]),
  ats('lever', 'Lever', [
    {
      kind: 'applicant',
      url: /^https:\/\/hire\.lever\.co\/candidates\/[0-9a-f-]+/,
    },
    {
      kind: 'applicant-list',
      url: /^https:\/\/hire\.lever\.co\/(candidates|jobs\/[0-9a-f-]+)(\?|$)/,
    },
  ]),
  ats('ashby', 'Ashby', [
    {
      kind: 'applicant',
      url: /^https:\/\/app\.ashbyhq\.com\/candidates\/[0-9a-f-]+/,
    },
    {
      kind: 'applicant-list',
      url: /^https:\/\/app\.ashbyhq\.com\/(jobs\/[0-9a-f-]+|candidates)(\/|\?|$)/,
    },
  ]),
  ats('workday', 'Workday', [
    {
      kind: 'applicant',
      url: /^https:\/\/[a-z0-9-]+\.myworkday\.com\/.+\/(d\/inst|candidate)/,
    },
  ]),
]

export function siteById(id: SiteId): Site {
  const site = SITES.find((s) => s.id === id)
  if (!site) throw new Error(`no such site: ${id}`)
  return site
}

/** The site and kind of page `url` is, or null. The first site listed wins (Recruiter before LinkedIn). */
export function recognisePage(
  url: string,
): { site: Site; kind: PageKind } | null {
  for (const site of SITES) {
    for (const page of site.pages) {
      if (page.url.test(url)) return { site, kind: page.kind }
    }
  }
  return null
}
