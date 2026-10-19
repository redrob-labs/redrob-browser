/**
 * @license
 * Copyright 2026 Redrob and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The memory half of chrome.redrobPrivate, typed and promised.
 *
 * Memory is a folder of markdown files the browser owns (docs/MEMORY.md). This page never reaches the
 * disk: every read and write goes through the browser, and every write the page makes is recorded as a
 * "user" run there, snapshotted first, so it can be reverted like the agent's own runs.
 */

export type MemoryFile = { path: string; bytes: number; modifiedMs: number }

export type MemoryRunKind = 'extract' | 'consolidate' | 'user' | 'revert'

export type MemoryRun = {
  id: string
  kind: MemoryRunKind
  startedMs: number
  durationMs: number
  tokens: number
  files: { path: string; added: number; removed: number }[]
  finished: boolean
  revertible: boolean
}

export type MemorySettings = {
  enabled: boolean
  retentionDays: number
  historyInput: boolean
  files: MemoryFile[]
  runs: MemoryRun[]
  lastConsolidationMs: number
}

type MemoryApi = {
  getSettings(callback: (settings: { memory: MemorySettings }) => void): void
  setMemoryEnabled(enabled: boolean): void
  setMemoryRetentionDays(days: number): void
  setMemoryHistoryInput(enabled: boolean): void
  forgetAllMemory(): void
  removeMemory(path: string, callback: (ok: boolean) => void): void
  readMemoryFile(path: string, callback: (content?: string) => void): void
  writeMemoryFile(
    path: string,
    content: string,
    callback: (ok: boolean) => void,
  ): void
  revertMemoryRun(runId: string, callback: (ok: boolean) => void): void
  runMemoryConsolidation(callback: (ok: boolean) => void): void
}

/** The API, or null outside the browser (a dev build in stock Chromium, the UI capture harness). */
export function memoryApi(): MemoryApi | null {
  const candidate = (
    globalThis as { chrome?: { redrobPrivate?: Partial<MemoryApi> } }
  ).chrome?.redrobPrivate
  return typeof candidate?.readMemoryFile === 'function' &&
    typeof candidate.getSettings === 'function'
    ? (candidate as MemoryApi)
    : null
}

function need(): MemoryApi {
  const api = memoryApi()
  if (!api) throw new Error('redrobPrivate memory API is unavailable')
  return api
}

export const readMemorySettings = (): Promise<MemorySettings> =>
  new Promise((resolve) => need().getSettings((s) => resolve(s.memory)))

export const readMemoryFile = (path: string): Promise<string | undefined> =>
  new Promise((resolve) => need().readMemoryFile(path, resolve))

export const writeMemoryFile = (
  path: string,
  content: string,
): Promise<boolean> =>
  new Promise((resolve) => need().writeMemoryFile(path, content, resolve))

export const deleteMemoryFile = (path: string): Promise<boolean> =>
  new Promise((resolve) => need().removeMemory(path, resolve))

export const revertMemoryRun = (runId: string): Promise<boolean> =>
  new Promise((resolve) => need().revertMemoryRun(runId, resolve))

export const runMemoryConsolidation = (): Promise<boolean> =>
  new Promise((resolve) => need().runMemoryConsolidation(resolve))

export const setMemoryEnabled = (enabled: boolean) =>
  need().setMemoryEnabled(enabled)
export const setMemoryRetentionDays = (days: number) =>
  need().setMemoryRetentionDays(days)
export const setMemoryHistoryInput = (enabled: boolean) =>
  need().setMemoryHistoryInput(enabled)
export const forgetAllMemory = () => need().forgetAllMemory()
