/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type {
  Application,
  ApplicationStatus,
} from '@browseros/jobs/applications'
import type { JobPosting } from '@browseros/jobs/posting'
import type { ApplyMode, JobProfile } from '@browseros/jobs/profile'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { postingByTabStorage } from '@/lib/jobs/jobStorage'
import { useAgentServerUrl } from '@/modules/browseros/agent-server-url.hooks'

const JOBS_KEY = ['jobs'] as const

export class JobRequestError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message)
  }
}

async function ok<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string }
    }
    throw new JobRequestError(
      body.error?.message ?? `request failed: ${response.status}`,
      body.error?.code,
    )
  }
  return (await response.json()) as T
}

const json = (body: unknown, method = 'POST'): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

/** The job posting the active tab is showing, as the content script last saw it. */
export function useActivePosting(): JobPosting | null {
  const [tabId, setTabId] = useState<number | undefined>()
  const [map, setMap] = useState<Record<string, JobPosting>>({})
  useEffect(() => {
    void chrome.tabs
      .query({ active: true, currentWindow: true })
      .then((tabs) => setTabId(tabs[0]?.id))
    const onActivated = (info: { tabId: number }) => setTabId(info.tabId)
    chrome.tabs.onActivated.addListener(onActivated)
    void postingByTabStorage.getValue().then(setMap)
    const unwatch = postingByTabStorage.watch((next) => setMap(next ?? {}))
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated)
      unwatch()
    }
  }, [])
  return tabId === undefined ? null : (map[String(tabId)] ?? null)
}

export function useJobProfile() {
  const { baseUrl } = useAgentServerUrl()
  return useQuery<JobProfile>({
    queryKey: [...JOBS_KEY, 'profile', baseUrl],
    enabled: Boolean(baseUrl),
    queryFn: async () =>
      (
        await ok<{ profile: JobProfile }>(
          await fetch(`${baseUrl}/jobs/profile`),
        )
      ).profile,
  })
}

export function useApplications() {
  const { baseUrl } = useAgentServerUrl()
  return useQuery<Application[]>({
    queryKey: [...JOBS_KEY, 'applications', baseUrl],
    enabled: Boolean(baseUrl),
    refetchInterval: 5_000,
    queryFn: async () =>
      (
        await ok<{ applications: Application[] }>(
          await fetch(`${baseUrl}/jobs/applications`),
        )
      ).applications,
  })
}

export function useJobActions() {
  const { baseUrl } = useAgentServerUrl()
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: JOBS_KEY })
  return {
    baseUrl,
    saveProfile: useMutation<
      JobProfile,
      Error,
      Omit<JobProfile, 'version' | 'resume'>
    >({
      mutationFn: async (profile) =>
        (
          await ok<{ profile: JobProfile }>(
            await fetch(`${baseUrl}/jobs/profile`, json(profile, 'PUT')),
          )
        ).profile,
      onSuccess: refresh,
    }),
    uploadResume: useMutation<JobProfile, Error, File>({
      mutationFn: async (file) =>
        (
          await ok<{ profile: JobProfile }>(
            await fetch(
              `${baseUrl}/jobs/resume?name=${encodeURIComponent(file.name)}`,
              { method: 'POST', body: file },
            ),
          )
        ).profile,
      onSuccess: refresh,
    }),
    removeResume: useMutation<JobProfile, Error, void>({
      mutationFn: async () =>
        (
          await ok<{ profile: JobProfile }>(
            await fetch(`${baseUrl}/jobs/resume`, { method: 'DELETE' }),
          )
        ).profile,
      onSuccess: refresh,
    }),
    queue: useMutation<
      Application,
      JobRequestError,
      { posting: JobPosting; automatic?: boolean }
    >({
      mutationFn: async (input) =>
        (
          await ok<{ application: Application }>(
            await fetch(`${baseUrl}/jobs/applications`, json(input)),
          )
        ).application,
      onSuccess: refresh,
    }),
    start: useMutation<
      string,
      Error,
      { id: string; conversationId: string; mode: ApplyMode }
    >({
      mutationFn: async ({ id, ...body }) =>
        (
          await ok<{ message: string }>(
            await fetch(`${baseUrl}/jobs/applications/${id}/runs`, json(body)),
          )
        ).message,
      onSuccess: refresh,
    }),
    update: useMutation<
      Application,
      Error,
      { id: string; status?: ApplicationStatus; note?: string }
    >({
      mutationFn: async ({ id, ...patch }) =>
        (
          await ok<{ application: Application }>(
            await fetch(
              `${baseUrl}/jobs/applications/${id}`,
              json(patch, 'PATCH'),
            ),
          )
        ).application,
      onSuccess: refresh,
    }),
    remove: useMutation<void, Error, string>({
      mutationFn: async (id) => {
        await fetch(`${baseUrl}/jobs/applications/${id}`, { method: 'DELETE' })
      },
      onSuccess: refresh,
    }),
  }
}
