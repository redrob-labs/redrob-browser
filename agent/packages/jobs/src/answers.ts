/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { type Answer, VOLUNTARY } from './profile'

const norm = (value: string) =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/**
 * The answer-bank entry a form's question asks for, or null. A question matches an entry when the
 * entry's question or an alias appears in it as whole words. Ties go to the longest match, so
 * "Current salary" is not answered with "Expected salary".
 */
export function answerFor(
  question: string,
  bank: readonly Answer[],
): Answer | null {
  const q = ` ${norm(question)} `
  let best: { entry: Answer; length: number } | null = null
  for (const entry of bank) {
    for (const phrase of [entry.question, ...entry.aliases]) {
      const p = norm(phrase)
      if (!p) continue
      const hit = /[\p{Script=Hangul}]/u.test(p)
        ? q.includes(p)
        : q.includes(` ${p} `)
      if (hit && (!best || p.length > best.length))
        best = { entry, length: p.length }
    }
  }
  return best?.entry ?? null
}

/** What goes in the form: the person's answer, "decline" for an empty voluntary one, else nothing. */
export function usableAnswer(entry: Answer): string | null {
  if (entry.answer.trim()) return entry.answer.trim()
  return VOLUNTARY.has(entry.id)
    ? 'Decline to self-identify / 응답하지 않음'
    : null
}
