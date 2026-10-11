/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { useEffect, useState } from 'react'
import { sentry } from '@/lib/sentry/sentry'
import type { ChatMode } from './chat-types'
import { getDefaultStarterPrompts } from './starter-prompts'
import { observeStarterPrompts } from './starter-prompts-storage'

/** Loads and observes saved shortcuts; the empty state remounts this hook per mode. */
export function useStarterPrompts(mode: ChatMode) {
  const [prompts, setPrompts] = useState(() => getDefaultStarterPrompts(mode))
  const [isLoading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: retry must restart the storage subscription and initial read.
  useEffect(() => {
    setLoading(true)
    setLoadError(false)
    return observeStarterPrompts(
      mode,
      (value) => {
        setPrompts(value)
        setLoading(false)
        setLoadError(false)
      },
      (error) => {
        sentry.captureException(error, {
          // i18n-ignore: telemetry, not copy
          extra: { message: 'Failed to load starter prompts', mode },
        })
        setLoading(false)
        setLoadError(true)
      },
    )
  }, [mode, attempt])

  return {
    prompts,
    isLoading,
    loadError,
    retry: () => setAttempt((value) => value + 1),
  }
}
