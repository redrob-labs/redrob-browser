/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { type MessageKey, t } from '@browseros/i18n'
import { z } from 'zod'
import type { ChatMode } from './chat-types'

/** Fixed shortcut slots shared by new-tab and side-panel conversations. */
export const STARTER_PROMPT_SLOTS = [0, 1, 2] as const
export const STARTER_PROMPT_LABEL_LIMIT = 80
export const STARTER_PROMPT_TEXT_LIMIT = 4000

export const starterPromptsSchema = z
  .array(
    z.object({
      display: z
        .string()
        .trim()
        .min(1, t('spEnterLabel'))
        .max(STARTER_PROMPT_LABEL_LIMIT),
      prompt: z
        .string()
        .trim()
        .min(1, t('spEnterPrompt'))
        .max(STARTER_PROMPT_TEXT_LIMIT),
    }),
  )
  .length(STARTER_PROMPT_SLOTS.length)

/** A compact button label and the complete instruction sent when it is run. */
export type StarterPrompt = z.infer<typeof starterPromptsSchema>[number]

/** Message keys, read through t() each time, so the defaults follow the page's language. */
const defaults: Record<ChatMode, [MessageKey, MessageKey][]> = {
  chat: [
    ['spStarterChat1', 'spStarterChat1Prompt'],
    ['spStarterChat2', 'spStarterChat2Prompt'],
    ['spStarterChat3', 'spStarterChat3Prompt'],
  ],
  agent: [
    ['spStarterAgent1', 'spStarterAgent1Prompt'],
    ['spStarterAgent2', 'spStarterAgent2Prompt'],
    ['spStarterAgent3', 'spStarterAgent3Prompt'],
  ],
}

export function getDefaultStarterPrompts(mode: ChatMode): StarterPrompt[] {
  return defaults[mode].map(([display, prompt]) => ({
    display: t(display),
    prompt: t(prompt),
  }))
}

/** Storage is an untrusted boundary: invalid preferences never break new chat. */
export function resolveStarterPrompts(
  mode: ChatMode,
  value: unknown,
): StarterPrompt[] {
  const result = starterPromptsSchema.safeParse(value)
  return result.success ? result.data : getDefaultStarterPrompts(mode)
}
