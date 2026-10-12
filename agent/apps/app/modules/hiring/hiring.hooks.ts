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

export interface HiringMessage {
  id: string
  roleId: string
  personId: string
  channel: string
  sequence: number
  body: string
  status: 'draft' | 'approved' | 'sending' | 'sent' | 'not-sent' | 'stopped'
  approvedBy: string | null
  note: string | null
  sentAt: number | null
  createdAt: number
  updatedAt: number
}

export function useMessages(roleId: string | undefined) {
  const { baseUrl } = useAgentServerUrl()
  return useQuery<{
    messages: HiringMessage[]
    today: Array<{ channel: string; sent: number; cap: number }>
  }>({
    queryKey: [...HIRING_KEY, 'messages', roleId ?? 'all', baseUrl],
    enabled: Boolean(baseUrl),
    refetchInterval: 5_000,
    queryFn: async () =>
      ok(
        await fetch(
          `${baseUrl}/hiring/messages${roleId ? `?roleId=${roleId}` : ''}`,
        ),
      ),
  })
}

export class OutreachRefused extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

async function okOrRefused<T>(response: Response): Promise<T> {
  if (response.status === 409) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { code?: string }
    }
    throw new OutreachRefused(body.error?.code ?? 'refused')
  }
  return ok<T>(response)
}

export function useOutreachActions() {
  const { baseUrl } = useAgentServerUrl()
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: HIRING_KEY })
  return {
    draft: useMutation<
      | { status: 'drafted'; message: HiringMessage }
      | {
          status: 'needs-you'
          reason: 'privacy' | 'no-model' | 'model-failed'
        },
      Error,
      {
        roleId: string
        personId: string
        notice: string
        language: string
        body?: string
        sequence?: number
      }
    >({
      mutationFn: async ({ roleId, personId, ...body }) =>
        okOrRefused(
          await fetch(
            `${baseUrl}/hiring/roles/${roleId}/people/${personId}/messages`,
            json(body),
          ),
        ),
      onSuccess: refresh,
    }),
    update: useMutation<
      unknown,
      Error,
      { id: string; body?: string; status?: 'approved' | 'not-sent' }
    >({
      mutationFn: async ({ id, ...body }) =>
        okOrRefused(
          await fetch(`${baseUrl}/hiring/messages/${id}`, json(body, 'PATCH')),
        ),
      onSuccess: refresh,
    }),
    approve: useMutation<unknown, Error, string[]>({
      mutationFn: async (ids) =>
        okOrRefused(
          await fetch(`${baseUrl}/hiring/messages/approve`, json({ ids })),
        ),
      onSuccess: refresh,
    }),
    start: useMutation<
      { instruction: string },
      Error,
      { id: string; conversationId: string }
    >({
      mutationFn: async ({ id, conversationId }) =>
        okOrRefused(
          await fetch(
            `${baseUrl}/hiring/messages/${id}/start`,
            json({ conversationId }),
          ),
        ),
      onSuccess: refresh,
    }),
    end: useMutation<{ message: HiringMessage | null }, Error, string>({
      mutationFn: async (conversationId) =>
        ok(
          await fetch(
            `${baseUrl}/hiring/messages/end`,
            json({ conversationId }),
          ),
        ),
      onSuccess: refresh,
    }),
    reply: useMutation<
      { optedOut: boolean },
      Error,
      { roleId: string; personId: string; text: string }
    >({
      mutationFn: async ({ roleId, personId, text }) =>
        ok(
          await fetch(
            `${baseUrl}/hiring/roles/${roleId}/people/${personId}/reply`,
            json({ text }),
          ),
        ),
      onSuccess: refresh,
    }),
    setMode: useMutation<
      unknown,
      Error,
      { roleId: string; mode: Role['mode'] }
    >({
      mutationFn: async ({ roleId, mode }) =>
        ok(
          await fetch(
            `${baseUrl}/hiring/roles/${roleId}`,
            json({ mode }, 'PATCH'),
          ),
        ),
      onSuccess: refresh,
    }),
  }
}
