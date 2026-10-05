/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import type { FC } from 'react'
import { BrowserOsAiPane } from './BrowserOsAiPane'

/**
 * AI & Agents settings. A single BrowserOS AI pane that manages LLM providers,
 * the default model, and coding agents (Claude Code / Codex). Coding agents are
 * created from cards in the provider-templates grid and managed inline at the
 * bottom of the pane — there are no longer per-adapter tabs.
 */
export const AISettingsPage: FC = () => {
  return <BrowserOsAiPane />
}
