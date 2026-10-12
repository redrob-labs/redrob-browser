/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The one model call Talent Scout makes: the person's selected LLM provider, as refine-prompt resolves
 * it, with no tools. `generateText` with no `tools` cannot act; it can only answer.
 */

import { generateText } from 'ai'
import { resolveRefineProvider } from '../../api/routes/refine-prompt'
import { providerRowToLlmConfig } from '../../api/services/chat-provider-config'
import type { Complete } from '../../api/services/hiring-screening'
import { resolveLLMConfig } from '../clients/llm/config'
import { createLLMProvider } from '../clients/llm/provider'
import { dbProviderStore } from '../providers/provider-store'

export function providerCompleter(browserosId?: string): Complete {
  return async (system, user) => {
    const resolution = await resolveRefineProvider(dbProviderStore, {})
    if (!resolution.ok || !resolution.row) {
      throw new Error(resolution.ok ? 'no provider' : resolution.message)
    }
    const config = providerRowToLlmConfig(resolution.row)
    if (!config.provider || !config.model) throw new Error('no model')
    const model = createLLMProvider(
      await resolveLLMConfig(
        { ...config, provider: config.provider, model: config.model },
        browserosId,
      ),
    )
    const { text } = await generateText({
      model,
      system,
      messages: [{ role: 'user', content: user }],
      temperature: 0,
      abortSignal: AbortSignal.timeout(60_000),
    })
    return text
  }
}
