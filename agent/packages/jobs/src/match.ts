/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * How a posting measures against the person's criteria, condition by condition, each with the words
 * of the posting it rests on. The design system's MatchBreakdown rule holds: a condition the posting
 * says nothing about is "no evidence either way", and it is left out of the count, not counted
 * against the job.
 */

import type { JobPosting } from './posting'
import type { Criterion } from './profile'

export type MatchState = 'met' | 'unknown'

export interface CriterionMatch {
  criterion: Criterion
  state: MatchState
  /** The sentence of the posting that is the evidence, when there is one. */
  evidence?: string
}

export interface JobMatch {
  items: CriterionMatch[]
  met: number
  /** Conditions with evidence either way: the denominator. */
  judged: number
  /** All must-haves have evidence. Only these qualify for automatic applications. */
  qualifies: boolean
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function matchJob(
  posting: JobPosting,
  criteria: readonly Criterion[],
): JobMatch {
  const haystack = [
    posting.title,
    posting.location ?? '',
    ...sentences(posting.description),
  ]
  const items = criteria.map((criterion): CriterionMatch => {
    const words = (
      criterion.keywords.length ? criterion.keywords : [criterion.text]
    )
      .map((w) => w.toLowerCase().trim())
      .filter(Boolean)
    const evidence = haystack.find((line) => {
      const lower = line.toLowerCase()
      return words.some((w) => lower.includes(w))
    })
    return evidence
      ? { criterion, state: 'met', evidence: evidence.slice(0, 240) }
      : { criterion, state: 'unknown' }
  })
  const met = items.filter((i) => i.state === 'met').length
  const musts = items.filter((i) => i.criterion.kind === 'must')
  return {
    items,
    met,
    judged: met,
    qualifies: musts.length > 0 && musts.every((i) => i.state === 'met'),
  }
}
