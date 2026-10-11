/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * What job a page is advertising: schema.org JobPosting (JSON-LD, which Google for Jobs made nearly
 * universal on ATS pages: Greenhouse, Lever, Workday, Ashby, Wanted, Saramin), then small fallbacks
 * for the job boards that render without it (LinkedIn's job view, Naukri). No network, no model.
 */

export interface JobPosting {
  title: string
  company: string
  location?: string
  /** Plain text, trimmed to 8,000 characters: what the criteria are matched against. */
  description: string
  url: string
  /** The application system the page belongs to, when known: decides the adapter. */
  system?: ApplySystem
  source: 'json-ld' | 'page'
}

export type ApplySystem =
  | 'linkedin'
  | 'indeed'
  | 'greenhouse'
  | 'lever'
  | 'workday'
  | 'ashby'
  | 'naukri'
  | 'wanted'
  | 'saramin'
  | 'jobkorea'

const SYSTEMS: Array<[RegExp, ApplySystem]> = [
  [/(^|\.)linkedin\.com$/, 'linkedin'],
  [/(^|\.)indeed\.(com|co\.in)$/, 'indeed'],
  [/(^|\.)greenhouse\.io$/, 'greenhouse'],
  [/(^|\.)lever\.co$/, 'lever'],
  [/(^|\.)myworkdayjobs\.com$|(^|\.)workday\.com$/, 'workday'],
  [/(^|\.)ashbyhq\.com$/, 'ashby'],
  [/(^|\.)naukri\.com$/, 'naukri'],
  [/(^|\.)wanted\.co\.kr$/, 'wanted'],
  [/(^|\.)saramin\.co\.kr$/, 'saramin'],
  [/(^|\.)jobkorea\.co\.kr$/, 'jobkorea'],
]

export function systemFor(url: string): ApplySystem | undefined {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return SYSTEMS.find(([pattern]) => pattern.test(host))?.[1]
  } catch {
    return undefined
  }
}

type Json = Record<string, unknown>
const arr = (v: unknown): unknown[] =>
  Array.isArray(v) ? v : v === undefined ? [] : [v]
const str = (v: unknown): string | undefined => {
  if (typeof v === 'string') return v.trim() || undefined
  if (v && typeof v === 'object' && 'name' in v) return str((v as Json).name)
  return undefined
}

/** HTML in a JSON-LD description, as text. */
export function plainText(html: string): string {
  return html
    .replace(/<(br|\/p|\/li|\/h\d)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim()
    .slice(0, 8000)
}

function location(node: Json): string | undefined {
  for (const place of arr(node.jobLocation)) {
    const address = (place as Json)?.address as Json | undefined
    const parts = [
      str(address?.addressLocality),
      str(address?.addressRegion),
      str(address?.addressCountry),
    ].filter(Boolean)
    if (parts.length) return parts.join(', ')
  }
  return node.jobLocationType === 'TELECOMMUTE' ? 'Remote' : undefined
}

export function detectJobPosting(
  doc: Document,
  url: string,
): JobPosting | null {
  for (const script of doc.querySelectorAll(
    'script[type="application/ld+json"]',
  )) {
    let value: unknown
    try {
      value = JSON.parse(script.textContent ?? '')
    } catch {
      continue
    }
    const nodes = arr(value).flatMap((n) => [
      n,
      ...arr((n as Json)?.['@graph']),
    ])
    const node = nodes.find((n) =>
      arr((n as Json)?.['@type']).includes('JobPosting'),
    ) as Json | undefined
    if (!node) continue
    const title = str(node.title)
    const company = str(node.hiringOrganization)
    if (!title || !company) continue
    return {
      title,
      company,
      location: location(node),
      description: plainText(String(node.description ?? '')),
      url,
      system: systemFor(url),
      source: 'json-ld',
    }
  }
  // LinkedIn's job view and Naukri render the posting without JSON-LD.
  const system = systemFor(url)
  const pick = (selector: string) =>
    doc.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim()
  if (system === 'linkedin' && /\/jobs\/(view|search|collections)/.test(url)) {
    const title = pick(
      '.job-details-jobs-unified-top-card__job-title, .top-card-layout__title, h1',
    )
    const company = pick(
      '.job-details-jobs-unified-top-card__company-name, .topcard__org-name-link, .topcard__flavor',
    )
    const description =
      pick('#job-details, .jobs-description__content, .description__text') ?? ''
    if (title && company) {
      return {
        title,
        company,
        description: description.slice(0, 8000),
        url,
        system,
        source: 'page',
      }
    }
  }
  if (system === 'naukri' && /job-listings/.test(url)) {
    const title = pick('h1')
    const company = pick(
      '[class*="jd-header-comp-name"] a, [class*="comp-name"]',
    )
    const description =
      pick('[class*="job-desc"], [class*="dang-inner-html"]') ?? ''
    if (title && company) {
      return {
        title,
        company,
        description: description.slice(0, 8000),
        url,
        system,
        source: 'page',
      }
    }
  }
  return null
}
