/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { Globe } from '@browseros/icons'
import { type FC, useState } from 'react'
import { getFavicons } from '@/lib/getFavicons'
import { useRecentSites } from './recent-sites.hooks'

const RecentSiteIcon: FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return <Globe className="h-7 w-7 text-foreground" />
  }

  return (
    <img
      src={src}
      alt={alt}
      className="h-7 w-7 object-contain"
      onError={() => {
        setFailed(true)
      }}
      onLoad={(e) => {
        const img = e.currentTarget
        if (img.naturalWidth === 0 || img.naturalHeight === 0) {
          setFailed(true)
        }
      }}
    />
  )
}

export const RecentSites: FC = () => {
  const recentSites = useRecentSites()

  if (!recentSites.length) return null

  return (
    <div className="space-y-4">
      <h2 className="ui-meta-label text-center">Recent sites</h2>
      <div className="flex flex-wrap items-center justify-center gap-6">
        {recentSites.map((site) => {
          const icon = site.host ? getFavicons(site.host) : undefined
          return (
            <a
              key={site.url}
              href={site.url}
              className="ui-tile group flex flex-col items-center gap-2 p-1"
            >
              <div className="ui-tile__face flex h-14 w-14 items-center justify-center">
                {icon ? (
                  <RecentSiteIcon src={icon} alt={site.name} />
                ) : (
                  <Globe className="h-7 w-7 text-[var(--ink-secondary)]" />
                )}
              </div>
              <span className="line-clamp-1 max-w-18 text-xs">{site.name}</span>
            </a>
          )
        })}
      </div>
    </div>
  )
}
