/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

export interface ScheduledJob {
  id: string
  name: string
  query: string
  scheduleType: 'daily' | 'hourly' | 'minutes'
  scheduleTime?: string
  scheduleInterval?: number
  enabled: boolean
  providerId?: string
  createdAt: string
  updatedAt: string
  lastRunAt?: string
}

export interface ToolCallExecution {
  id: string
  name: string
  input: unknown
  output?: unknown
  error?: string
  timestamp: string
}

export interface ScheduledJobRun {
  id: string
  jobId: string
  startedAt: string
  completedAt?: string
  status: 'running' | 'completed' | 'failed'
  result?: string
  finalResult?: string
  executionLog?: string
  toolCalls?: ToolCallExecution[]
  error?: string
}
