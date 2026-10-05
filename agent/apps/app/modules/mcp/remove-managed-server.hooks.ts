/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import useSWRMutation from 'swr/mutation'
import { useAgentServerUrl } from '@/modules/browseros/agent-server-url.hooks'

interface RemoveServerResponse {
  success: boolean
  serverName: string
}

interface RemoveServerError {
  error: string
}

const removeManagedServer = async (
  url: string,
  { arg }: { arg: { serverName: string } },
): Promise<RemoveServerResponse> => {
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ serverName: arg.serverName }),
  })

  if (!response.ok) {
    const errorData = (await response.json()) as RemoveServerError
    throw new Error(errorData.error || 'Failed to remove server')
  }

  return response.json() as Promise<RemoveServerResponse>
}

export const useRemoveManagedServer = () => {
  const { baseUrl: agentServerUrl } = useAgentServerUrl()

  return useSWRMutation(
    agentServerUrl ? `${agentServerUrl}/klavis/servers/remove` : null,
    removeManagedServer,
  )
}
