/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * One person across sites, and the people never to write to again.
 *
 * A person is the same record when a key matches exactly: the profile URL, an email they published,
 * or the ATS's id. A similar name at the same employer is only a suggestion, shown with how sure it
 * is, because merging two people silently would mix up their records.
 *
 * The suppression list holds salted hashes of profile URLs and emails. They are kept after the
 * person's data is deleted, so someone who asked not to be contacted never is, and they reveal
 * nothing about who that was.
 */

import { createHash } from 'node:crypto'
import type { Candidate } from './candidate'

/** `linkedin.com/in/jordan-example`: scheme, `www.`, query, fragment and trailing slash dropped. */
export function normaliseProfileUrl(url: string): string {
  try {
    const u = new URL(url)
    const host = u.hostname
      .toLowerCase()
      .replace(/^(www|[a-z]{2,3})\.(?=linkedin\.com$)/, '')
      .replace(/^www\./, '')
    return `${host}${u.pathname.replace(/\/+$/, '')}`.toLowerCase()
  } catch {
    return url.trim().toLowerCase()
  }
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Exact keys for de-duplication. */
export function personKeys(
  candidate: Pick<Candidate, 'url' | 'contact' | 'atsId' | 'site' | 'links'>,
): string[] {
  const keys = new Set<string>([`url:${normaliseProfileUrl(candidate.url)}`])
  for (const link of candidate.links) {
    // A GitHub profile linked from LinkedIn is the same person: same key either way.
    if (/^https:\/\/(www\.)?(linkedin\.com\/in|github\.com)\//.test(link)) {
      keys.add(`url:${normaliseProfileUrl(link)}`)
    }
  }
  for (const route of candidate.contact) {
    if (route.kind === 'email' && route.value)
      keys.add(`email:${normaliseEmail(route.value)}`)
  }
  if (candidate.atsId) keys.add(`ats:${candidate.site}:${candidate.atsId}`)
  return [...keys]
}

const foldName = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** How sure Talent Scout is that two records are one person: exact, a suggestion, or none. */
export function samePerson(
  a: Candidate,
  b: Candidate,
): { confidence: 'exact' | 'likely' | 'none'; because?: string } {
  const keysA = new Set(personKeys(a))
  const shared = personKeys(b).find((k) => keysA.has(k))
  if (shared) return { confidence: 'exact', because: shared.split(':')[0] }
  const name = foldName(a.name)
  if (name && name === foldName(b.name)) {
    const orgs = new Set(
      a.positions.map((p) => foldName(p.organisation ?? '')).filter(Boolean),
    )
    const common = b.positions.find((p) =>
      orgs.has(foldName(p.organisation ?? '')),
    )
    if (common) return { confidence: 'likely', because: 'name and employer' }
  }
  return { confidence: 'none' }
}

/** The hashes a suppression keeps for one person. The salt is per device, never sent anywhere. */
export function suppressionHashes(
  candidate: Pick<Candidate, 'url' | 'contact' | 'links' | 'atsId' | 'site'>,
  salt: string,
): string[] {
  return personKeys(candidate)
    .filter((k) => !k.startsWith('ats:'))
    .map((k) => createHash('sha256').update(`${salt}\n${k}`).digest('hex'))
}

export function isSuppressed(
  candidate: Pick<Candidate, 'url' | 'contact' | 'links' | 'atsId' | 'site'>,
  salt: string,
  suppressed: ReadonlySet<string>,
): boolean {
  return suppressionHashes(candidate, salt).some((h) => suppressed.has(h))
}
