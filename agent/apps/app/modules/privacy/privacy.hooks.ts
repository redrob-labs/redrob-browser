/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAgentServerUrl } from '@/modules/browseros/agent-server-url.hooks'
import type { PrivacyStatus, PrivacyUpdate } from './privacy.types'

export const PRIVACY_QUERY_KEY = ['privacy-status'] as const

/** 404 means a server from before Privacy Protection: there is nothing to show, not "off". */
export class PrivacyUnavailableError extends Error {}

async function readStatus(response: Response): Promise<PrivacyStatus> {
  if (response.status === 404) {
    throw new PrivacyUnavailableError('this Redrob has no Privacy Protection')
  }
  if (!response.ok)
    throw new Error(`Privacy request failed: ${response.status}`)
  return (await response.json()) as PrivacyStatus
}

export function usePrivacyStatus() {
  const { baseUrl } = useAgentServerUrl()
  return useQuery<PrivacyStatus>({
    queryKey: [...PRIVACY_QUERY_KEY, baseUrl],
    enabled: Boolean(baseUrl),
    staleTime: 10_000,
    retry: (count, error) =>
      !(error instanceof PrivacyUnavailableError) && count < 2,
    // The count and the model's download move on their own; follow them while something is happening.
    refetchInterval: (query) =>
      query.state.data?.detector.state === 'downloading' ? 1_000 : 30_000,
    queryFn: async () => readStatus(await fetch(`${baseUrl}/privacy`)),
  })
}

export function useUpdatePrivacy() {
  const { baseUrl } = useAgentServerUrl()
  const queryClient = useQueryClient()
  return useMutation<PrivacyStatus, Error, PrivacyUpdate>({
    mutationFn: async (update) =>
      readStatus(
        await fetch(`${baseUrl}/privacy`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update),
        }),
      ),
    onSuccess: (status) => {
      queryClient.setQueryData([...PRIVACY_QUERY_KEY, baseUrl], status)
    },
  })
}

export function useRetryPrivacyModel() {
  const { baseUrl } = useAgentServerUrl()
  const queryClient = useQueryClient()
  return useMutation<PrivacyStatus, Error, void>({
    mutationFn: async () =>
      readStatus(await fetch(`${baseUrl}/privacy/model`, { method: 'POST' })),
    onSuccess: (status) => {
      queryClient.setQueryData([...PRIVACY_QUERY_KEY, baseUrl], status)
    },
  })
}
