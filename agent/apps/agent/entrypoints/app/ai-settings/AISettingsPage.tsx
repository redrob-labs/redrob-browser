import type { FC } from 'react'
import { BrowserOsAiPane } from './BrowserOsAiPane'

/**
 * AI & Agents settings. A single BrowserOS AI pane that manages LLM providers,
 * the default model, and coding agents (Claude Code / Codex). Creation of
 * coding agents lives inline in the pane (see CodingAgentsSection) — there are
 * no longer per-adapter tabs.
 */
export const AISettingsPage: FC = () => {
  return <BrowserOsAiPane />
}
