/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import type { ExecutionTaskRecord } from './types'

/**
 * Cheap change detector for a task: covers task identity, step progress,
 * counts, status, and the streamed preview without serializing tool
 * input/output payloads. Used to skip redundant writes instead of
 * `JSON.stringify`-ing the whole task (which, with base64 tool results, was a
 * per-token cost, #1972). Including the id keeps keys distinct across tasks so
 * one task's saved state never dedupes another's write.
 */
export function taskChangeKey(task: ExecutionTaskRecord): string {
  const lastStep = task.steps[task.steps.length - 1]
  return [
    task.id,
    task.status,
    task.steps.length,
    lastStep?.id ?? '',
    lastStep?.state ?? '',
    lastStep?.previewText ?? '',
    task.actionCount,
    task.approvalCount,
    task.deniedCount,
    task.errorCount,
    task.assistantMessageId ?? '',
    task.completedAt ?? '',
    task.responsePreview ?? '',
  ].join('|')
}
