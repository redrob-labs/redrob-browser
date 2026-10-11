/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { Playbook } from '@browseros/playbooks/playbook'
import type { TeachEvent } from '@browseros/playbooks/teach'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAgentServerUrl } from '@/modules/browseros/agent-server-url.hooks'

export const PLAYBOOKS_KEY = ['playbooks'] as const

async function ok<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string }
    }
    throw new Error(body.error?.message ?? `request failed: ${response.status}`)
  }
  return (await response.json()) as T
}

const json = (body: unknown, method = 'POST'): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export function usePlaybooks() {
  const { baseUrl } = useAgentServerUrl()
  return useQuery<Playbook[]>({
    queryKey: [...PLAYBOOKS_KEY, baseUrl],
    enabled: Boolean(baseUrl),
    queryFn: async () =>
      (await ok<{ playbooks: Playbook[] }>(await fetch(`${baseUrl}/playbooks`)))
        .playbooks,
  })
}

export function usePlaybookActions() {
  const { baseUrl } = useAgentServerUrl()
  const queryClient = useQueryClient()
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: PLAYBOOKS_KEY })
  return {
    draft: useMutation<
      Playbook,
      Error,
      { events: TeachEvent[]; name?: string }
    >({
      mutationFn: async (input) =>
        (
          await ok<{ playbook: Playbook }>(
            await fetch(`${baseUrl}/playbooks/draft`, json(input)),
          )
        ).playbook,
    }),
    save: useMutation<Playbook, Error, Playbook>({
      mutationFn: async (playbook) =>
        (
          await ok<{ playbook: Playbook }>(
            await fetch(
              `${baseUrl}/playbooks/${encodeURIComponent(playbook.id)}`,
              json(playbook, 'PUT'),
            ),
          )
        ).playbook,
      onSuccess: refresh,
    }),
    remove: useMutation<void, Error, string>({
      mutationFn: async (id) => {
        await fetch(`${baseUrl}/playbooks/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        })
      },
      onSuccess: refresh,
    }),
    /** Registers the run with the server (its guard) and returns the message that starts it. */
    start: useMutation<
      string,
      Error,
      { id: string; conversationId: string; values: Record<string, string> }
    >({
      mutationFn: async ({ id, ...body }) =>
        (
          await ok<{ message: string }>(
            await fetch(
              `${baseUrl}/playbooks/${encodeURIComponent(id)}/runs`,
              json(body),
            ),
          )
        ).message,
      onSuccess: refresh,
    }),
  }
}

/** Playbooks that work on the host the active tab is showing. */
export function playbooksForUrl(
  playbooks: readonly Playbook[],
  url: string | undefined,
): Playbook[] {
  if (!url) return []
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return []
  }
  return playbooks.filter((p) =>
    p.sites.some((s) => host === s || host.endsWith(`.${s}`)),
  )
}
