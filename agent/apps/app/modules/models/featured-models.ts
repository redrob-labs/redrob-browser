/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The models offered for a Redrob Console provider: Redrob Auto first, then one recommended model per
 * lab, the same five Redrob Cowork shows (its featured-models.ts fallback list). The full catalogue,
 * hundreds of models, stays in Settings, where the model id can be typed.
 */

import type { MessageKey } from '@browseros/i18n'

export const REDROB_AUTO = 'auto'

export interface FeaturedModel {
  modelId: string
  name: string
  lab: string
  note: MessageKey
}

export const FEATURED_MODELS: readonly FeaturedModel[] = [
  {
    modelId: 'anthropic/claude-opus-5.5',
    name: 'Claude Opus 5.5',
    lab: 'Anthropic',
    note: 'modelNoteAnthropic',
  },
  {
    modelId: 'gpt-6-astra',
    name: 'GPT-6 Astra',
    lab: 'OpenAI',
    note: 'modelNoteOpenai',
  },
  {
    modelId: 'google/gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    lab: 'Google',
    note: 'modelNoteGoogle',
  },
  {
    modelId: 'meta/muse-spark-1.3',
    name: 'Muse Spark 1.3',
    lab: 'Meta',
    note: 'modelNoteMeta',
  },
  {
    modelId: 'x-ai/grok-4.7',
    name: 'Grok 4.7',
    lab: 'SpaceXAI',
    note: 'modelNoteXai',
  },
]

export interface ModelRow {
  modelId: string
  name: string
  kind: 'auto' | 'featured' | 'current'
  lab?: string
  note?: MessageKey
}

/** Auto, the featured five, and the model in use when it is none of them, so nothing is hidden. */
export function modelRows(currentId: string, autoName: string): ModelRow[] {
  // The console's catalogue also names Auto with its provider prefix.
  const current = currentId === 'redrob/auto' ? REDROB_AUTO : currentId
  const rows: ModelRow[] = [
    {
      modelId: REDROB_AUTO,
      name: autoName,
      kind: 'auto',
      note: 'modelNoteAuto',
    },
    ...FEATURED_MODELS.map((m) => ({ ...m, kind: 'featured' as const })),
  ]
  if (current && !rows.some((row) => row.modelId === current)) {
    rows.push({ modelId: current, name: current, kind: 'current' })
  }
  return rows
}
