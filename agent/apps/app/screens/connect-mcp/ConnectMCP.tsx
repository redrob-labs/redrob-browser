/**
 * @license
 * Copyright 2025 BrowserOS
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { t } from '@browseros/i18n'
import { ExternalLink, Plus, Trash2 } from '@browseros/icons'
import { type FC, useState } from 'react'
import { McpServerIcon } from '@/components/mcp/McpServerIcon'
import { SettingsHeader } from '@/components/settings/SettingsLayout'
import { Button } from '@/components/ui/button'
import { CUSTOM_MCP_ADDED_EVENT } from '@/lib/constants/analyticsEvents'
import { POPULAR_APPS } from '@/lib/popular-apps'
import { useMcpServers } from '@/lib/mcp/mcpServerStorage'
import { track } from '@/lib/metrics/track'
import { AddCustomMCPDialog } from './AddCustomMCPDialog'

const openInTab = (url: string) => window.open(url, '_blank')?.focus()

/**
 * Apps. Popular apps come first and need no setup: the agent works in the user's own signed-in tabs,
 * so the page says how to use them rather than offering to connect them. Below that, a user can add
 * an MCP server of their own by URL. There is no third-party connector catalogue: sending a user
 * through someone else's Google consent screen to reach their own mail is exactly what made the
 * old page look like phishing.
 *
 * @public
 */
export const ConnectMCP: FC = () => {
  const { servers, addServer, removeServer } = useMcpServers()
  const [addingCustomMcp, setAddingCustomMcp] = useState(false)
  // Entries from the removed connector catalogue are still in some users' storage. They no longer
  // do anything, so they are not shown; removing one is the user's call, from here, below.
  const customServers = servers.filter((server) => server.type === 'custom')
  const staleServers = servers.filter((server) => server.type !== 'custom')

  const addCustomServer = (config: {
    name: string
    url: string
    description: string
  }) => {
    addServer({
      id: Date.now().toString(),
      displayName: config.name,
      type: 'custom',
      config: {
        url: config.url,
        description: config.description,
      },
    })
    track(CUSTOM_MCP_ADDED_EVENT)
  }

  return (
    <div className="fade-in slide-in-from-bottom-5 animate-in space-y-6 duration-500">
      <SettingsHeader
        title={t('navApps')}
        lede={t('paPageLede')}
        actions={
          <Button variant="outline" onClick={() => setAddingCustomMcp(true)}>
            <Plus className="h-4 w-4" />
            <span>{t('stAddCustomApp2')}</span>
          </Button>
        }
      />

      <section aria-labelledby="popular-apps" className="ui-settings-group">
        <h2 id="popular-apps" className="ui-meta-label">
          {t('paMenuTitle')}
        </h2>
        <div className="ui-card ui-settings-rows">
          {POPULAR_APPS.map((app) => (
            <div key={app.id} className="ui-settings-row">
              <div className="ui-sample flex h-10 w-10 shrink-0 items-center justify-center">
                <McpServerIcon serverName={app.icon} size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="ui-settings-row__label mb-1">{t(app.label)}</div>
                <p className="ui-settings-row__desc">
                  {t('paTryAsking')} “{t(app.examplePrompt)}”
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openInTab(app.url)}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t('paOpenApp')}
              </Button>
            </div>
          ))}
        </div>
        <p className="mt-2 text-muted-foreground text-xs">
          {t('paSignInHint')}
        </p>
      </section>

      {(customServers.length > 0 || staleServers.length > 0) && (
        <section aria-labelledby="custom-apps" className="ui-settings-group">
          <h2 id="custom-apps" className="ui-meta-label">
            {t('stYourConnectedApps')}
          </h2>
          <div className="ui-card ui-settings-rows">
            {[...customServers, ...staleServers].map((server) => (
              <div key={server.id} className="ui-settings-row">
                <div className="ui-sample flex h-10 w-10 shrink-0 items-center justify-center">
                  <McpServerIcon
                    serverName={server.managedServerName ?? ''}
                    size={20}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="ui-settings-row__label">
                      {server.displayName}
                    </span>
                    <span className="rr-badge rr-badge--sm rr-badge--subtle rr-badge--neutral">
                      {server.type === 'custom'
                        ? t('stCustom')
                        : t('paRetired')}
                    </span>
                  </div>
                  <p className="ui-settings-row__desc">
                    {server.type === 'custom'
                      ? server.config?.description || server.config?.url
                      : t('paRetiredDesc')}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeServer(server.id)}
                  className="ui-row-delete"
                  title={t('stRemoveServer')}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <AddCustomMCPDialog
        open={addingCustomMcp}
        onOpenChange={setAddingCustomMcp}
        onAddServer={addCustomServer}
      />
    </div>
  )
}
