/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Which parts of a person's own message the AI saw as placeholders, worked out in the panel with
 * the same patterns the server's gate uses (@browseros/privacy/labels, dependency-free).
 *
 * The message is stored and shown as the person wrote it; this only marks it. It covers what has a
 * fixed shape and the names listed in Settings. Names the on-device model finds at Strict are
 * labelled by the server but not marked here, because the model does not run in the panel.
 */

import {
  emptyLabelMap,
  type LabelCategory,
  labelText,
} from '@browseros/privacy/labels'
import type { PrivacyLevel } from './privacy.types'

export type MessagePiece =
  | { kind: 'text'; text: string }
  | { kind: 'private'; text: string; as: string; category: LabelCategory }

const LABEL = /\[([A-Z]+)_\d+\]/g

export function splitPrivate(
  text: string,
  level: PrivacyLevel,
  names: readonly (readonly string[])[] = [],
): MessagePiece[] {
  if (level === 'off' || !text) return [{ kind: 'text', text }]
  const map = emptyLabelMap(0)
  const labelled = labelText(text, { level, names }, map).text
  const pieces: MessagePiece[] = []
  let last = 0
  for (const match of labelled.matchAll(LABEL)) {
    const index = match.index ?? 0
    const value = map.byLabel[match[0]]
    if (value === undefined) continue
    if (index > last)
      pieces.push({ kind: 'text', text: labelled.slice(last, index) })
    pieces.push({
      kind: 'private',
      text: value,
      as: match[0],
      category: match[1] as LabelCategory,
    })
    last = index + match[0].length
  }
  if (last < labelled.length)
    pieces.push({ kind: 'text', text: labelled.slice(last) })
  return pieces
}

/** The kinds a message holds, in the order first seen, for the Strict confirmation. */
export function privateKinds(pieces: readonly MessagePiece[]): LabelCategory[] {
  const kinds: LabelCategory[] = []
  for (const piece of pieces) {
    if (piece.kind === 'private' && !kinds.includes(piece.category)) {
      kinds.push(piece.category)
    }
  }
  return kinds
}

export function privateCount(pieces: readonly MessagePiece[]): number {
  return new Set(
    pieces.flatMap((piece) => (piece.kind === 'private' ? [piece.as] : [])),
  ).size
}
