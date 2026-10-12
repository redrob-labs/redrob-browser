/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Talent Scout's sourcing (Recruit plan §4.1). Two ways a person arrives:
 *
 *   * the page the recruiter has open, sent by the panel. No extra tab and no extra profile view, so
 *     the site's view counts and the recruiter's usage stay normal;
 *   * a list the recruiter asked to review: each profile read one at a time in a collapsed tab group
 *     "Talent Scout · <role>", through the shared background reader with the site's pace and daily
 *     budget. A site that asks to sign in, shows a check, or is at its limit is reported, never retried.
 *
 * Each person is evaluated on this device against the role's device checks. Criteria the model judges
 * stay "No evidence either way" until screening (5.4) runs.
 */

import { activeCriteria } from '@browseros/hiring/criteria'
import { evaluate } from '@browseros/hiring/evaluate'
import type { ExtractOutcome } from '@browseros/hiring/extract'
import { extractListUrls, extractPage } from '@browseros/hiring/extract'
import { recognisePage } from '@browseros/hiring/sites'
import type { HiringStore } from '../../lib/hiring/store'
import {
  type BackgroundReader,
  NeverReadSiteError,
  PageTimeoutError,
  ReadBudgetError,
} from './background-reader'

export type SourceStatus =
  | 'ok'
  | 'none'
  | 'sign-in'
  | 'blocked'
  | 'timeout'
  | 'failed'
  | 'limit'
  | 'never-read'
  | 'unknown-site'
  /** The workspace's policy does not allow Talent Scout in this site's region. */
  | 'region'

export interface SourceResult {
  url: string
  status: SourceStatus
  personId?: string
  isNew?: boolean
  /** Asked not to be contacted: kept on the list, never written to. */
  suppressed?: boolean
}

function statusOf(error: unknown): SourceStatus {
  if (error instanceof NeverReadSiteError) return 'never-read'
  if (error instanceof ReadBudgetError) return 'limit'
  if (error instanceof PageTimeoutError) return 'timeout'
  return 'failed'
}

export class HiringSourcing {
  constructor(
    private readonly store: HiringStore,
    private readonly reader: BackgroundReader | null,
    private readonly now: () => number = Date.now,
    private readonly regions: () => readonly string[] | null = () => null,
  ) {}

  private regionAllowed(region: string): boolean {
    const allowed = this.regions()
    return !allowed || region === 'any' || allowed.includes(region)
  }

  private async keep(
    roleId: string,
    url: string,
    outcome: ExtractOutcome,
  ): Promise<SourceResult[]> {
    if (outcome.status !== 'ok') return [{ url, status: outcome.status }]
    const role = this.store.getRole(roleId)
    if (!role) return [{ url, status: 'failed' }]
    const criteria = {
      version: role.criteria.version,
      items: activeCriteria(role.criteria),
    }
    const out: SourceResult[] = []
    for (const candidate of outcome.candidates) {
      const kept = await this.store.upsertPerson(roleId, candidate)
      this.store.setEvaluation(
        roleId,
        kept.personId,
        evaluate(candidate, criteria, [], new Date(this.now())),
      )
      out.push({ url: candidate.url, status: 'ok', ...kept })
    }
    return out
  }

  /** The page already open in the recruiter's tab, as the panel read it. */
  async fromOpenPage(
    roleId: string,
    page: { url: string; html: string },
  ): Promise<SourceResult[]> {
    const recognised = recognisePage(page.url)
    if (!recognised) return [{ url: page.url, status: 'unknown-site' }]
    if (!this.regionAllowed(recognised.site.region)) {
      return [{ url: page.url, status: 'region' }]
    }
    return this.keep(roleId, page.url, extractPage(page.html, page.url))
  }

  /**
   * The list the recruiter has open: the people it links to, each then read in the background, one at
   * a time, in the role's tab group. Only the people on the open page; no further pages are fetched.
   */
  async fromListPage(
    roleId: string,
    page: { url: string; html: string },
    groupTitle: string,
  ): Promise<SourceResult[]> {
    const urls = extractListUrls(page.html, page.url, 50)
    return urls.length ? this.fromUrls(roleId, urls, groupTitle) : []
  }

  /** Profiles from a list, read in the background, one at a time per site. */
  async fromUrls(
    roleId: string,
    urls: string[],
    groupTitle: string,
  ): Promise<SourceResult[]> {
    const out: SourceResult[] = []
    const limited = new Set<string>()
    for (const url of urls) {
      const page = recognisePage(url)
      if (page && !this.regionAllowed(page.site.region)) {
        out.push({ url, status: 'region' })
        continue
      }
      if (page && limited.has(page.site.id)) {
        out.push({ url, status: 'limit' })
        continue
      }
      if (!page || !this.reader) {
        out.push({ url, status: page ? 'failed' : 'unknown-site' })
        continue
      }
      try {
        const read = await this.reader.read(url, {
          group: groupTitle,
          timeoutMs: 30_000,
          as: 'html',
          site: page.site.id,
          pace: {
            minMs: page.site.limits.readGapMs[0],
            maxMs: page.site.limits.readGapMs[1],
            dailyBudget: page.site.limits.readsPerDay,
          },
        })
        out.push(
          ...(await this.keep(
            roleId,
            read.url,
            extractPage(read.html ?? '', read.url),
          )),
        )
      } catch (error) {
        const status = statusOf(error)
        out.push({ url, status })
        // A site at its limit stays there for the day: the rest of its list is not tried.
        if (status === 'limit') limited.add(page.site.id)
      }
    }
    return out
  }
}
