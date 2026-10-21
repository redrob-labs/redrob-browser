/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { t } from '@browseros/i18n'
import type { FC } from 'react'
import { McpServerIcon } from '@/components/mcp/McpServerIcon'
import { GOOGLE_APPS } from '@/lib/google-apps'

/**
 * Gmail, Drive, Docs and Calendar on the new tab, always. Users asked to open their mail and files
 * straight from a fresh tab; recent sites only show them once they have been visited enough.
 */
export const GoogleAppTiles: FC = () => (
  <nav aria-label={t('gaMenuTitle')} className="space-y-4">
    <h2 className="ui-meta-label text-center">{t('gaMenuTitle')}</h2>
    <div className="flex flex-wrap items-center justify-center gap-6">
      {GOOGLE_APPS.map((app) => (
        <a
          key={app.id}
          href={app.url}
          className="ui-tile group flex flex-col items-center gap-2 p-1"
        >
          <div className="ui-tile__face flex h-14 w-14 items-center justify-center">
            <McpServerIcon serverName={app.name} size={28} />
          </div>
          <span className="line-clamp-1 max-w-18 text-xs">
            {t(app.label)}
          </span>
        </a>
      ))}
    </div>
  </nav>
)
