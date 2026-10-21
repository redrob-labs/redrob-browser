/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { t } from '@browseros/i18n'
import type { FC } from 'react'
import { McpServerIcon } from '@/components/mcp/McpServerIcon'
import { POPULAR_APPS } from '@/lib/popular-apps'

/**
 * Popular apps on the new tab, always. Users asked to open their mail and files straight from a
 * fresh tab; recent sites only show them once they have been visited enough.
 */
export const PopularAppTiles: FC = () => (
  <nav aria-label={t('paMenuTitle')} className="space-y-4">
    <h2 className="ui-meta-label text-center">{t('paMenuTitle')}</h2>
    <div className="flex items-center justify-center gap-6 overflow-x-auto">
      {POPULAR_APPS.map((app) => (
        <a
          key={app.id}
          href={app.url}
          className="ui-tile group flex flex-col items-center gap-2 p-1"
        >
          <div className="ui-tile__face flex h-14 w-14 items-center justify-center">
            <McpServerIcon serverName={app.icon} size={28} />
          </div>
          <span className="line-clamp-1 max-w-18 text-xs">{t(app.label)}</span>
        </a>
      ))}
    </div>
  </nav>
)
