/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Where to look for jobs, by the browser's region. Links the person opens in their own signed-in
 * browser; postings found there are read by the content script and matched in the panel.
 */

export type JobRegion = 'KR' | 'IN' | 'US'

export interface JobSite {
  id: string
  name: string
  search: (keywords: string) => string
}

const q = encodeURIComponent

export const JOB_SITES: Record<JobRegion, JobSite[]> = {
  US: [
    {
      id: 'linkedin',
      name: 'LinkedIn',
      search: (k) => `https://www.linkedin.com/jobs/search/?keywords=${q(k)}`,
    },
    {
      id: 'indeed',
      name: 'Indeed',
      search: (k) => `https://www.indeed.com/jobs?q=${q(k)}`,
    },
  ],
  IN: [
    {
      id: 'naukri',
      name: 'Naukri',
      search: (k) =>
        `https://www.naukri.com/${k.trim().toLowerCase().replace(/\s+/g, '-')}-jobs`,
    },
    {
      id: 'linkedin',
      name: 'LinkedIn',
      search: (k) =>
        `https://www.linkedin.com/jobs/search/?keywords=${q(k)}&location=India`,
    },
    {
      id: 'indeed',
      name: 'Indeed India',
      search: (k) => `https://in.indeed.com/jobs?q=${q(k)}`,
    },
    {
      id: 'foundit',
      name: 'foundit',
      search: (k) => `https://www.foundit.in/srp/results?query=${q(k)}`,
    },
  ],
  KR: [
    {
      id: 'wanted',
      name: 'Wanted',
      search: (k) =>
        `https://www.wanted.co.kr/search?query=${q(k)}&tab=position`,
    },
    {
      id: 'saramin',
      name: 'Saramin',
      search: (k) =>
        `https://www.saramin.co.kr/zf_user/search?searchword=${q(k)}`,
    },
    {
      id: 'jobkorea',
      name: 'JobKorea',
      search: (k) => `https://www.jobkorea.co.kr/Search/?stext=${q(k)}`,
    },
    {
      id: 'linkedin',
      name: 'LinkedIn',
      search: (k) =>
        `https://www.linkedin.com/jobs/search/?keywords=${q(k)}&location=South%20Korea`,
    },
  ],
}

export function jobRegionForLocale(locale: string): JobRegion {
  const l = locale.toLowerCase()
  if (l === 'ko' || l.startsWith('ko-')) return 'KR'
  if (l === 'hi' || l.startsWith('hi-') || l.endsWith('-in')) return 'IN'
  return 'US'
}
