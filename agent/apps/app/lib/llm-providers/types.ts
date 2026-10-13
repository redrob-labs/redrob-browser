/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

/** AI settings provider config types. Most API-backed values match backend AIProvider. */
export type ProviderType =
  | 'anthropic'
  | 'openai'
  | 'openai-compatible'
  | 'google'
  | 'openrouter'
  | 'azure'
  | 'ollama'
  | 'lmstudio'
  | 'bedrock'
  | 'moonshot'
  | 'redrob-console'
  | 'chatgpt-pro'
  | 'github-copilot'
  | 'qwen-code'

/**
 * LLM Provider configuration
 * @public
 */
export interface LlmProviderConfig {
  /** Unique identifier for the provider */
  id: string
  /** Provider type/template */
  type: ProviderType
  /** Display name for the provider */
  name: string
  /** Base API URL (optional for Azure with resourceName, not used for Bedrock) */
  baseUrl?: string
  headers?: Record<string, string>
  /** Model identifier */
  modelId: string
  /** API key (encrypted and stored locally) */
  apiKey?: string
  /** Whether this provider supports image inputs */
  supportsImages: boolean
  /** Context window size (number of tokens) */
  contextWindow: number
  /** Temperature for model sampling (0-2) */
  temperature: number
  /** Timestamp when created */
  createdAt: number
  /** Timestamp when last updated */
  updatedAt: number

  // Azure-specific fields
  /** Azure OpenAI resource name (used to construct URL if baseUrl not provided) */
  resourceName?: string

  // Bedrock-specific fields
  /** AWS access key ID */
  accessKeyId?: string
  /** AWS secret access key */
  secretAccessKey?: string
  /** AWS region (e.g., us-east-1) */
  region?: string
  /** AWS session token (for temporary STS credentials) */
  sessionToken?: string

  // Reasoning controls. `reasoningEffort` accepts any level the selected model
  // advertises via the models.dev catalog (e.g. minimal/low/medium/high/xhigh/max),
  // so it is stored as a free string validated against the model at selection time.
  reasoningEffort?: string
  reasoningSummary?: 'auto' | 'concise' | 'detailed'

  // Whether a credential is stored on the server, for providers read back from
  // it. The values themselves never leave the server, so a form editing an
  // existing provider sees these rather than the secret, and leaving a field
  // blank keeps what is stored.
  hasApiKey?: boolean
  hasAccessKeyId?: boolean
  hasSecretAccessKey?: boolean
  hasSessionToken?: boolean

  // A Redrob Console provider with no key of its own while Redrob Launcher is
  // signed in on this computer: requests use the launcher's shared key. Read
  // from the server with the row; the key itself never reaches the app.
  viaLauncher?: boolean
}

/**
 * Schema for LLM provider config stored in BrowserOS prefs (browseros.providers)
 * @public
 */
export interface LlmProvidersBackup {
  defaultProviderId: string
  providers: LlmProviderConfig[]
}
