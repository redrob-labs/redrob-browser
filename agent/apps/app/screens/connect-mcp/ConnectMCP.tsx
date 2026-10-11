/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { Check, Loader2, Plus, Trash2 } from '@browseros/icons'
import { type FC, useState } from 'react'
import { toast } from 'sonner'
import { ApiKeyDialog } from '@/components/mcp/ApiKeyDialog'
import { McpServerIcon } from '@/components/mcp/McpServerIcon'
import { SettingsHeader } from '@/components/settings/SettingsLayout'
import { Button } from '@/components/ui/button'
import {
  CUSTOM_MCP_ADDED_EVENT,
  MANAGED_MCP_ADDED_EVENT,
} from '@/lib/constants/analyticsEvents'
import { useMcpServers } from '@/lib/mcp/mcpServerStorage'
import { track } from '@/lib/metrics/track'
import { sentry } from '@/lib/sentry/sentry'
import { useAddManagedServer } from '@/modules/mcp/add-managed-server.hooks'
import { useGetMCPServersList } from '@/modules/mcp/managed-mcp-servers.hooks'
import { useRemoveManagedServer } from '@/modules/mcp/remove-managed-server.hooks'
import { useSubmitApiKey } from '@/modules/mcp/submit-api-key.hooks'
import { useSyncRemoteIntegrations } from '@/modules/mcp/sync-remote-integrations.hooks'
import { useGetUserMCPIntegrations } from '@/modules/mcp/user-integrations.hooks'
import { AddCustomMCPDialog } from './AddCustomMCPDialog'
import { AddManagedMCPDialog } from './AddManagedMCPDialog'
import { AvailableManagedServers } from './AvailableManagedServers'

const failedToAddMcp = (serverName: string, e: unknown) => {
  toast.error(`Failed to add app: ${serverName}`)
  sentry.captureException(e)
}

const failedToRemoveMcp = (serverName: string, e: unknown) => {
  toast.error(`Failed to remove app: ${serverName}`)
  sentry.captureException(e)
}

/**
 * @public
 */
export const ConnectMCP: FC = () => {
  const { servers: createdServers, addServer, removeServer } = useMcpServers()
  const [addingManagedMcp, setAddingManagedMcp] = useState(false)
  const [addingCustomMcp, setAddingCustomMcp] = useState(false)
  const [deletingServerId, setDeletingServerId] = useState<string | null>(null)
  const [apiKeyServer, setApiKeyServer] = useState<{
    name: string
    description: string
    apiKeyUrl: string
  } | null>(null)

  const { trigger: addManagedServerMutation } = useAddManagedServer()
  const { trigger: removeManagedServerMutation } = useRemoveManagedServer()
  const { trigger: submitApiKeyMutation, isMutating: isSubmittingApiKey } =
    useSubmitApiKey()

  const { data: serversList } = useGetMCPServersList()

  const {
    data: userMCPIntegrations,
    isLoading: isUserMCPIntegrationsLoading,
    mutate: mutateUserIntegrations,
  } = useGetUserMCPIntegrations()

  useSyncRemoteIntegrations()

  const openAuthUrlForMCP = async (mcpName: string) => {
    try {
      const response = await addManagedServerMutation({
        serverName: mcpName,
      })

      if (response.apiKeyUrl) {
        setApiKeyServer({
          name: mcpName,
          description: '',
          apiKeyUrl: response.apiKeyUrl,
        })
        return
      }

      if (!response.oauthUrl) {
        failedToAddMcp(mcpName, 'No auth URL returned')
        return
      }

      window.open(response.oauthUrl, '_blank')?.focus()
    } catch (e) {
      failedToAddMcp(mcpName, e)
    }
  }

  const addManagedServer = async ({
    name,
    description,
  }: {
    name: string
    description: string
  }) => {
    try {
      const response = await addManagedServerMutation({
        serverName: name,
      })

      if (!response.apiKeyUrl && !response.oauthUrl) {
        failedToAddMcp(name, 'No auth URL returned')
        return
      }

      addServer({
        id: Date.now().toString(),
        displayName: name,
        type: 'managed',
        managedServerName: name,
        managedServerDescription: description,
      })
      track(MANAGED_MCP_ADDED_EVENT, { server_name: name })

      if (response.apiKeyUrl) {
        setApiKeyServer({ name, description, apiKeyUrl: response.apiKeyUrl })
        return
      }

      window.open(response.oauthUrl, '_blank')?.focus()
    } catch (e) {
      failedToAddMcp(name, e)
    }
  }

  const handleSubmitApiKey = async (apiKey: string) => {
    if (!apiKeyServer) return
    try {
      await submitApiKeyMutation({
        serverName: apiKeyServer.name,
        apiKey,
        apiKeyUrl: apiKeyServer.apiKeyUrl,
      })
      toast.success(`${apiKeyServer.name} connected successfully`)
      setApiKeyServer(null)
      mutateUserIntegrations()
    } catch (e) {
      toast.error(
        `Failed to connect ${apiKeyServer.name}: ${e instanceof Error ? e.message : 'Unknown error'}`,
      )
      sentry.captureException(e)
    }
  }

  const deleteManagedServer = async ({
    id,
    name,
  }: {
    id: string
    name: string
  }) => {
    setDeletingServerId(id)
    try {
      const response = await removeManagedServerMutation({
        serverName: name,
      })
      if (response.success) {
        removeServer(id)
        mutateUserIntegrations()
      } else {
        failedToRemoveMcp(name, 'Success not returned from server')
      }
    } catch (e) {
      failedToRemoveMcp(name, e)
    } finally {
      setDeletingServerId(null)
    }
  }

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

  const availableServers = serversList?.servers.filter((eachServer) => {
    const serverName = eachServer.name
    if (
      createdServers.find((server) => server.managedServerName === serverName)
    ) {
      return false
    }
    return true
  })

  const unauthenticatedServers: { name: string; description: string }[] = []
  if (!isUserMCPIntegrationsLoading) {
    for (const server of createdServers) {
      if (server.type !== 'managed' || !server.managedServerName) continue
      const integration = userMCPIntegrations?.integrations?.find(
        (i) => i.name === server.managedServerName,
      )
      if (!integration?.is_authenticated) {
        unauthenticatedServers.push({
          name: server.managedServerName,
          description: server.managedServerDescription ?? '',
        })
      }
    }
  }

  return (
    <div className="fade-in slide-in-from-bottom-5 animate-in space-y-6 duration-500">
      <SettingsHeader
        title="Connected Apps"
        lede="Connect the Redrob assistant to apps to send email, schedule calendar events, write docs, and more"
        actions={
          <>
            <Button onClick={() => setAddingManagedMcp(true)}>
              <Plus className="h-4 w-4" />
              <span>Add built-in app</span>
            </Button>
            <Button variant="outline" onClick={() => setAddingCustomMcp(true)}>
              <Plus className="h-4 w-4" />
              <span>Add custom app</span>
            </Button>
          </>
        }
      />

      {/* Created Servers */}
      {createdServers.length > 0 && (
        <section aria-labelledby="connected-apps" className="ui-settings-group">
          <h2 id="connected-apps" className="ui-meta-label">
            Your Connected Apps
          </h2>
          <div className="ui-card ui-settings-rows">
            {createdServers.map((server) => (
              <div key={server.id} className="ui-settings-row">
                <div className="ui-sample flex h-10 w-10 shrink-0 items-center justify-center">
                  <McpServerIcon
                    serverName={server.managedServerName ?? ''}
                    size={20}
                  />
                </div>
                <div className="flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="ui-settings-row__label">
                      {server.displayName}
                    </span>
                    <span
                      className={`rr-badge rr-badge--sm rr-badge--subtle ${
                        server.type === 'managed'
                          ? 'rr-badge--brand'
                          : 'rr-badge--neutral'
                      }`}
                    >
                      {server.type === 'managed' ? 'Built-in' : 'Custom'}
                    </span>
                  </div>
                  <p className="ui-settings-row__desc">
                    {/* The catalogue is read here as well as at sync time: an app synced before the
                        catalogue arrived was stored with an empty description, and kept it. */}
                    {server.managedServerDescription ||
                      serversList?.servers.find(
                        (s) => s.name === server.managedServerName,
                      )?.description ||
                      server.config?.description ||
                      server.config?.url}
                  </p>
                </div>
                {server.type === 'managed' &&
                  (isUserMCPIntegrationsLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : userMCPIntegrations?.integrations?.find(
                      (i) => i.name === server.managedServerName,
                    )?.is_authenticated ? (
                    <span className="rr-badge rr-badge--md rr-badge--subtle rr-badge--success gap-1">
                      <Check className="h-3 w-3" />
                      Authenticated
                    </span>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        server.managedServerName &&
                        openAuthUrlForMCP(server.managedServerName)
                      }
                    >
                      Authenticate
                    </Button>
                  ))}
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={deletingServerId === server.id}
                  onClick={() => {
                    if (server.type === 'managed' && server.managedServerName) {
                      deleteManagedServer({
                        id: server.id,
                        name: server.managedServerName,
                      })
                    } else {
                      removeServer(server.id)
                    }
                  }}
                  className="ui-row-delete"
                  title="Remove server"
                >
                  {deletingServerId === server.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <AvailableManagedServers
        availableServers={availableServers}
        onAddServer={addManagedServer}
        isLoading={false}
      />

      <AddManagedMCPDialog
        open={addingManagedMcp}
        onOpenChange={setAddingManagedMcp}
        serversList={availableServers}
        unauthenticatedServers={unauthenticatedServers}
        onAddServer={addManagedServer}
        onAuthenticate={openAuthUrlForMCP}
      />

      <AddCustomMCPDialog
        open={addingCustomMcp}
        onOpenChange={setAddingCustomMcp}
        onAddServer={addCustomServer}
      />

      <ApiKeyDialog
        open={!!apiKeyServer}
        onOpenChange={(open) => {
          if (!open) setApiKeyServer(null)
        }}
        serverName={apiKeyServer?.name ?? ''}
        onSubmit={handleSubmitApiKey}
        isSubmitting={isSubmittingApiKey}
      />
    </div>
  )
}
