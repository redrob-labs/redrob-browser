/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { LLMConfigSchema } from '@browseros/shared/schemas/llm'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { refinePrompt } from '../../lib/clients/llm/refine-prompt'
import type { ProviderRow } from '../../lib/db/schema'
import { logger } from '../../lib/logger'
import type { PrivacyGate } from '../../lib/privacy/gate'
import {
  dbProviderStore,
  type ProviderStore,
} from '../../lib/providers/provider-store'
import { providerRowToLlmConfig } from '../services/chat-provider-config'

/**
 * The provider is named, not described, the way /chat names one.
 *
 * Every inline field stays optional and accepted: the extension updates
 * independently of the browser binary, so a shipped build may still send the
 * whole configuration, including its API key.
 */
const RefinePromptRequestSchema = LLMConfigSchema.partial().extend({
  prompt: z.string().min(1, 'Prompt cannot be empty'),
  name: z.string().min(1, 'Task name cannot be empty'),
  model: z.string().min(1).optional(),
  upstreamProvider: z.string().optional(),
  providerId: z.string().optional(),
})

type RefineProviderLookup = Pick<
  ProviderStore,
  'getWithCredentials' | 'getDefaultWithCredentials' | 'listLlm'
>

interface RefinePromptRouteDeps {
  browserosId?: string
  /** Injectable so the resolution is testable without a database. */
  providerStore?: RefineProviderLookup
  privacyGate?: PrivacyGate
}

const NO_LLM_MESSAGE =
  'Connect an LLM provider in AI settings to refine a prompt'

type RefineProviderResolution =
  | { ok: true; row: ProviderRow | null }
  | { ok: false; message: string }

/**
 * Which provider refines the prompt.
 *
 * Refining needs an LLM, so the order is about not overriding a choice someone
 * already made, and about not failing when the selected target simply cannot
 * do this:
 *
 * 1. A named id is an explicit choice. An unknown one, or one naming a coding
 *    agent, is an error rather than a silent fall back to something else.
 * 2. A whole inline configuration with no id is an older extension that
 *    resolved the provider itself. That is its user's choice just as surely,
 *    so the selected provider is not read over the top of it.
 * 3. Otherwise the selection, and when the selection names a coding agent, the
 *    first LLM provider. The extension used to reach that same answer by
 *    resolving through a list that only ever held LLM providers, so a coding
 *    agent as the default has never stopped a prompt being refined.
 */
export async function resolveRefineProvider(
  store: RefineProviderLookup,
  inline: { providerId?: string; provider?: string; model?: string },
): Promise<RefineProviderResolution> {
  if (inline.providerId) {
    const named = await store.getWithCredentials(inline.providerId)
    if (!named) {
      return { ok: false, message: `Unknown provider ${inline.providerId}` }
    }
    if (named.kind !== 'llm') {
      return {
        ok: false,
        message: `Provider ${named.id} is a coding agent and cannot refine a prompt`,
      }
    }
    return { ok: true, row: named }
  }

  if (inline.provider && inline.model) return { ok: true, row: null }

  const selected = await store.getDefaultWithCredentials()
  if (selected?.kind === 'llm') return { ok: true, row: selected }

  const [firstLlm] = await store.listLlm()
  if (!firstLlm) return { ok: false, message: NO_LLM_MESSAGE }
  const row = await store.getWithCredentials(firstLlm.id)
  return row ? { ok: true, row } : { ok: false, message: NO_LLM_MESSAGE }
}

export function createRefinePromptRoutes(deps: RefinePromptRouteDeps = {}) {
  const store = deps.providerStore ?? dbProviderStore

  return new Hono().post(
    '/',
    zValidator('json', RefinePromptRequestSchema),
    async (c) => {
      const { prompt, name, ...inline } = c.req.valid('json')

      const resolution = await resolveRefineProvider(store, inline)
      if (!resolution.ok) {
        return c.json({ success: false, message: resolution.message }, 400)
      }

      const llmConfig = resolution.row
        ? { ...inline, ...providerRowToLlmConfig(resolution.row) }
        : inline

      if (!llmConfig.provider || !llmConfig.model) {
        return c.json({ success: false, message: NO_LLM_MESSAGE }, 400)
      }

      logger.info('Refine prompt request', {
        provider: llmConfig.provider,
        model: llmConfig.model,
        taskName: name,
      })

      // The draft a person is refining goes to the model like any message, so it is labelled
      // the same way, and the refined prompt they read comes back with the real values.
      const gate = deps.privacyGate
      const gateKey = `refine:${crypto.randomUUID()}`
      let labelled: { prompt: string; name: string }
      try {
        const texts = gate
          ? (await gate.label(gateKey, [prompt, name])).texts
          : [prompt, name]
        labelled = { prompt: texts[0] ?? prompt, name: texts[1] ?? name }
      } catch (error) {
        gate?.forget(gateKey)
        logger.warn('Refine prompt stopped by Privacy Protection', {
          error: error instanceof Error ? error.message : String(error),
        })
        return c.json(
          {
            success: false,
            message:
              'Privacy Protection could not check this prompt, so nothing was sent.',
          },
          400,
        )
      }
      const result = await refinePrompt(
        { ...llmConfig, provider: llmConfig.provider, model: llmConfig.model },
        labelled,
        deps.browserosId,
      )
      if (gate && result.success && result.refined) {
        result.refined = gate.restore(gateKey, result.refined)
      }
      gate?.forget(gateKey)

      logger.info('Refine prompt result', {
        provider: llmConfig.provider,
        success: result.success,
      })

      return c.json(result, result.success ? 200 : 400)
    },
  )
}
