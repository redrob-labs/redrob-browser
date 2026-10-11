/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Job Apply: the profile applications are filled from, where to look for jobs in the person's region,
 * and the tracker. The tracker opens first once there is something in it, because that is what comes
 * back to; the profile opens first until then, because nothing can be applied to without it.
 */

import { getLocale, t } from '@browseros/i18n'
import { Search } from '@browseros/icons'
import { JOB_SITES, jobRegionForLocale } from '@browseros/jobs/sites'
import { type FC, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useApplications, useJobProfile } from '@/modules/jobs/jobs.hooks'
import { ApplicationsTab } from './ApplicationsTab'
import { ProfileTab } from './ProfileTab'

function regionName(region: string): string {
  try {
    return (
      new Intl.DisplayNames([getLocale()], { type: 'region' }).of(region) ??
      region
    )
  } catch {
    return region
  }
}

const FindTab: FC<{ keywords: string }> = ({ keywords }) => {
  const region = jobRegionForLocale(chrome.i18n.getUILanguage())
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-[var(--text-secondary)]">
        {t('jobsFindLede')}
      </p>
      <h2 className="font-semibold text-[15px]">
        {t('jobsFindRegion', regionName(region))}
      </h2>
      {keywords.trim() ? null : (
        <p className="text-[13px] text-[var(--text-tertiary)]">
          {t('jobsFindNoKeywords')}
        </p>
      )}
      <ul className="grid gap-2 sm:grid-cols-2">
        {JOB_SITES[region].map((site) => (
          <li key={site.id}>
            <button
              type="button"
              className="rr-card w-full flex-row items-center gap-3 p-4 text-left"
              disabled={!keywords.trim()}
              onClick={() =>
                void chrome.tabs.create({ url: site.search(keywords.trim()) })
              }
            >
              <Search className="size-4 text-[var(--text-secondary)]" />
              <span className="font-medium text-[14px]">
                {t('jobsFindOpen', site.name)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="text-[12px] text-[var(--text-tertiary)]">
        {t('jobsSiteTerms')}
      </p>
    </div>
  )
}

export const JobsPage: FC = () => {
  const { data: profile } = useJobProfile()
  const { data: applications = [] } = useApplications()
  const [tab, setTab] = useState<string | null>(null)
  const current = tab ?? (applications.length ? 'applications' : 'profile')
  const attention = applications.filter(
    (a) => a.status === 'needs-you' || a.status === 'ready',
  ).length

  return (
    <div className="fade-in slide-in-from-bottom-5 mx-auto max-w-3xl animate-in space-y-6 p-6 duration-500">
      <header className="space-y-1">
        <h1 className="font-semibold text-xl">{t('jobsTitle')}</h1>
        <p className="text-[13px] text-[var(--text-secondary)]">
          {t('jobsLede')}
        </p>
      </header>
      {profile ? (
        <Tabs value={current} onValueChange={setTab} className="gap-6">
          <TabsList variant="line" aria-label={t('jobsTitle')}>
            <TabsTrigger value="profile">{t('jobsTabProfile')}</TabsTrigger>
            <TabsTrigger value="find">{t('jobsTabFind')}</TabsTrigger>
            <TabsTrigger value="applications">
              {t('jobsTabApplications')}
              {attention ? (
                <span className="rr-tab__count">{attention}</span>
              ) : null}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="profile">
            <ProfileTab profile={profile} />
          </TabsContent>
          <TabsContent value="find">
            <FindTab keywords={profile.keywords} />
          </TabsContent>
          <TabsContent value="applications">
            <ApplicationsTab applications={applications} profile={profile} />
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  )
}
