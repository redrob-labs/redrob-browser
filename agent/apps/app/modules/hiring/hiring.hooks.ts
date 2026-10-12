/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Talent Scout's server calls (apps/server/src/api/routes/hiring.ts). Shapes are repeated here rather
 * than imported from the server, as the other modules do: the extension ships separately.
 */

import type { Candidate } from '@browseros/hiring/candidate'
import type { CriteriaSet, Criterion } from '@browseros/hiring/criteria'
import type { Evaluation } from '@browseros/hiring/evaluate'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAgentServerUrl } from '@/modules/browseros/agent-server-url.hooks'

export type HiringStage =
  | 'found'
  | 'shortlisted'
  | 'contacted'
  | 'replied'
  | 'interview'
  | 'saved'
  | 'set-aside'

export type SetAsideReason =
  | 'doesnt-meet-must-have'
  | 'not-looking'
  | 'contacted-elsewhere'
  | 'other'

export interface Role {
  id: string
  title: string
  location: string | null
  description: string | null
  criteria: CriteriaSet
  mode: 'review' | 'batch' | 'automatic'
  sites: string[]
  createdAt: number
  updatedAt: number
}

export interface PersonOnRole {
  id: string
  record: Candidate
  sites: string[]
  readByModel: boolean
  stage: HiringStage
  reason?: string | null
  evaluation?: Evaluation | null
  foundAt: number
}

export interface HiringEvent {
  id: string
  roleId: string | null
  personId: string | null
  kind: string
  actor: string
  detail: Record<string, unknown> | null
  at: number
}

export type CriterionDraft = Pick<Criterion, 'text' | 'kind'> &
  Partial<Pick<Criterion, 'id' | 'inferred' | 'confirmed'>>

export interface Refused {
  text: string
  reason: string
}

export type SourceStatus =
  | 'ok'
  | 'none'
  | 'sign-in'
  | 'blocked'
  | 'timeout'
  | 'failed'
  | 'limit'
  | 'never-read'
  | 'unknown-site'

type ScreenOutcome =
  | { status: 'screened'; evaluation: Evaluation }
  | { status: 'needs-you'; reason: 'privacy' | 'no-model' | 'model-failed' }

const HIRING_KEY = ['hiring'] as const

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

export function useRoles() {
  const { baseUrl } = useAgentServerUrl()
  return useQuery<Role[]>({
    queryKey: [...HIRING_KEY, 'roles', baseUrl],
    enabled: Boolean(baseUrl),
    queryFn: async () =>
      (await ok<{ roles: Role[] }>(await fetch(`${baseUrl}/hiring/roles`)))
        .roles,
  })
}

export function usePeople(roleId: string | undefined) {
  const { baseUrl } = useAgentServerUrl()
  return useQuery<PersonOnRole[]>({
    queryKey: [...HIRING_KEY, 'people', roleId, baseUrl],
    enabled: Boolean(baseUrl && roleId),
    queryFn: async () =>
      (
        await ok<{ people: PersonOnRole[] }>(
          await fetch(`${baseUrl}/hiring/roles/${roleId}/people`),
        )
      ).people,
  })
}

export function useRecord(roleId: string | undefined) {
  const { baseUrl } = useAgentServerUrl()
  return useQuery<HiringEvent[]>({
    queryKey: [...HIRING_KEY, 'record', roleId ?? 'all', baseUrl],
    enabled: Boolean(baseUrl),
    queryFn: async () =>
      (
        await ok<{ events: HiringEvent[] }>(
          await fetch(
            `${baseUrl}/hiring/record${roleId ? `?roleId=${roleId}` : ''}`,
          ),
        )
      ).events,
  })
}

export function useHiringActions() {
  const { baseUrl } = useAgentServerUrl()
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: HIRING_KEY })
  return {
    createRole: useMutation<
      { role: Role; refused: Refused[] },
      Error,
      {
        title: string
        location?: string
        description?: string
        criteria: CriterionDraft[]
      }
    >({
      mutationFn: async (input) =>
        ok(await fetch(`${baseUrl}/hiring/roles`, json(input))),
      onSuccess: refresh,
    }),
    deleteRole: useMutation<void, Error, string>({
      mutationFn: async (id) => {
        await fetch(`${baseUrl}/hiring/roles/${id}`, { method: 'DELETE' })
      },
      onSuccess: refresh,
    }),
    reviseCriteria: useMutation<
      { criteria: CriteriaSet; refused: Refused[] },
      Error,
      { roleId: string; criteria: CriterionDraft[] }
    >({
      mutationFn: async ({ roleId, criteria }) =>
        ok(
          await fetch(
            `${baseUrl}/hiring/roles/${roleId}/criteria`,
            json({ criteria }, 'PUT'),
          ),
        ),
      onSuccess: refresh,
    }),
    propose: useMutation<
      { proposals: CriterionDraft[]; refused: Refused[] },
      Error,
      string
    >({
      mutationFn: async (description) =>
        ok(
          await fetch(
            `${baseUrl}/hiring/criteria/propose`,
            json({ description }),
          ),
        ),
    }),
    /** The page the recruiter has open, read by the panel and sent as it is. */
    addFromPage: useMutation<
      Array<{
        url: string
        status: SourceStatus
        personId?: string
        suppressed?: boolean
      }>,
      Error,
      { roleId: string; url: string; html: string }
    >({
      mutationFn: async ({ roleId, ...page }) =>
        (
          await ok<{
            results: Array<{
              url: string
              status: SourceStatus
              personId?: string
              suppressed?: boolean
            }>
          }>(
            await fetch(`${baseUrl}/hiring/roles/${roleId}/people`, json(page)),
          )
        ).results,
      onSuccess: refresh,
    }),
    screen: useMutation<
      ScreenOutcome,
      Error,
      { roleId: string; personId: string }
    >({
      mutationFn: async ({ roleId, personId }) =>
        ok(
          await fetch(
            `${baseUrl}/hiring/roles/${roleId}/people/${personId}/screen`,
            json({}),
          ),
        ),
      onSuccess: refresh,
    }),
    screenRole: useMutation<
      { results: Array<{ personId: string } & ScreenOutcome> },
      Error,
      string
    >({
      mutationFn: async (roleId) =>
        ok(await fetch(`${baseUrl}/hiring/roles/${roleId}/screen`, json({}))),
      onSuccess: refresh,
    }),
    setStage: useMutation<
      unknown,
      Error,
      {
        roleId: string
        personId: string
        stage: HiringStage
        reason?: SetAsideReason
      }
    >({
      mutationFn: async ({ roleId, personId, ...body }) =>
        ok(
          await fetch(
            `${baseUrl}/hiring/roles/${roleId}/people/${personId}`,
            json(body, 'PATCH'),
          ),
        ),
      onSuccess: refresh,
    }),
    deletePerson: useMutation<void, Error, string>({
      mutationFn: async (id) => {
        await fetch(`${baseUrl}/hiring/people/${id}`, { method: 'DELETE' })
      },
      onSuccess: refresh,
    }),
    optOut: useMutation<unknown, Error, string>({
      mutationFn: async (id) =>
        ok(await fetch(`${baseUrl}/hiring/people/${id}/opt-out`, json({}))),
      onSuccess: refresh,
    }),
  }
}
