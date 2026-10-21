/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { type MessageKey, t } from '@browseros/i18n'
import { AlertCircle, RefreshCw } from '@browseros/icons'
import {
  type ChatError as ChatErrorEnvelope,
  parseChatErrorEnvelope,
} from '@browseros/shared/schemas/chat-error'
import type { FC } from 'react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

export interface ChatErrorProps {
  error: Error
  onRetry?: () => void
  providerType?: string
}

interface ChatErrorView {
  title: string
  text: string
  url?: string
  linkLabel?: string
  details?: string
  canRetry: boolean
}

/**
 * Copy for codes the extension knows about. The server also sends a title and
 * message, used as-is for codes shipped after this build.
 */
const CODE_COPY: Partial<
  Record<
    ChatErrorEnvelope['code'],
    { title: MessageKey; linkLabel: MessageKey; text?: MessageKey }
  >
> = {
  rate_limited: { title: 'spErrRateLimited', linkLabel: 'spLearnMore' },
  auth_failed: {
    title: 'spErrAuth',
    linkLabel: 'spOpenAiSettings',
  },
  provider_config: {
    title: 'spErrProviderConfig',
    linkLabel: 'spOpenAiSettings',
  },
  connection_failed: {
    title: 'spErrConnection',
    linkLabel: 'spTroubleshooting',
  },
  context_length: { title: 'spErrContextLength', linkLabel: 'spLearnMore' },
  content_filter: { title: 'spErrContentFilter', linkLabel: 'spLearnMore' },
  provider_unavailable: {
    title: 'spErrUnavailable',
    linkLabel: 'spLearnMore',
  },
  // Agent mode runs on Redrob Code. Each way it can fail to start gets its own sentence in the user's
  // language, and every one of them names the way out: settings, or the Chat segment beside it.
  agent_not_installed: {
    title: 'spErrAgentNotInstalled',
    text: 'spErrAgentNotInstalledText',
    linkLabel: 'spOpenAiSettings',
  },
  agent_signed_out: {
    title: 'spErrAgentSignedOut',
    text: 'spErrAgentSignedOutText',
    linkLabel: 'spOpenAiSettings',
  },
  agent_start_failed: {
    title: 'spErrAgentStartFailed',
    text: 'spErrAgentStartFailedText',
    linkLabel: 'spOpenAiSettings',
  },
}

const SETTINGS_LINK_CODES: ReadonlySet<ChatErrorEnvelope['code']> = new Set([
  'auth_failed',
  'provider_config',
  'agent_not_installed',
  'agent_signed_out',
  'agent_start_failed',
])

const AI_SETTINGS_URL = '/app.html#/settings/ai'

function fromEnvelope(envelope: ChatErrorEnvelope): ChatErrorView {
  const known = CODE_COPY[envelope.code]
  const url =
    envelope.docsUrl ??
    (SETTINGS_LINK_CODES.has(envelope.code) ? AI_SETTINGS_URL : undefined)

  return {
    title: known ? t(known.title) : envelope.title,
    text: known?.text ? t(known.text) : envelope.message,
    url,
    linkLabel: known ? t(known.linkLabel) : undefined,
    details: envelope.details,
    canRetry: envelope.retryable,
  }
}

/**
 * Fallback for bare strings: client-side fetch failures, an older agent server,
 * or an error raised outside the classifier.
 */
function fromMessage(message: string): ChatErrorView {
  // All chat requests go through the local Redrob agent server, so any
  // fetch failure is always a local connection issue.
  if (message.includes('Failed to fetch') || message.includes('fetch failed')) {
    return {
      title: t('spErrConnection'),
      text: t('spErrAgentUnreachable'),
      canRetry: true,
    }
  }

  let text = message
  try {
    const parsed = JSON.parse(message)
    if (parsed?.error?.message) text = parsed.error.message
  } catch {}

  // Extract URL if present
  const urlMatch = text.match(/https?:\/\/[^\s]+/)
  const url = urlMatch?.[0]
  if (url) {
    text = text.replace(url, '').replace(/\s+/g, ' ').trim()
  }

  return {
    title: t('spErrGeneric'),
    text: text || t('spErrUnexpected'),
    url,
    canRetry: true,
  }
}

function buildView(message: string): ChatErrorView {
  const envelope = parseChatErrorEnvelope(message)
  return envelope ? fromEnvelope(envelope) : fromMessage(message)
}

/** Pretty-print JSON details; leave already-formatted or non-JSON text as-is. */
function formatErrorDetails(details: string): string {
  try {
    return JSON.stringify(JSON.parse(details), null, 2)
  } catch {
    return details
  }
}

export const ChatError: FC<ChatErrorProps> = ({ error, onRetry }) => {
  const [copiedDetails, setCopiedDetails] = useState(false)
  const view = buildView(error.message)

  const canRetry = !!onRetry && view.canRetry

  const detailsText = view.details ? formatErrorDetails(view.details) : ''

  // Copy targets the full string, not the DOM, so the whole error is copied even
  // though the block clips it to a scroll area on screen.
  const copyDetails = async () => {
    if (!detailsText) return
    try {
      await navigator.clipboard.writeText(detailsText)
      setCopiedDetails(true)
      window.setTimeout(() => setCopiedDetails(false), 1500)
    } catch {
      setCopiedDetails(false)
    }
  }

  return (
    <div className="mx-4 flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <AlertCircle className="h-5 w-5" />
        <span className="font-medium text-sm">{view.title}</span>
      </div>
      <p className="text-center text-destructive text-xs">{view.text}</p>
      {view.url && view.linkLabel && (
        <a
          href={view.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground text-xs underline hover:text-foreground"
        >
          {view.linkLabel}
        </a>
      )}
      {detailsText && detailsText !== view.text && (
        <div className="w-full">
          <div className="mb-1 flex items-center justify-between px-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
              {t('spFullError')}
            </span>
            <button
              type="button"
              onClick={copyDetails}
              className="text-[10px] text-muted-foreground underline hover:text-foreground"
            >
              {copiedDetails ? t('spCopied') : t('spCopy')}
            </button>
          </div>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border border-border bg-muted p-2 text-left text-[10px] text-muted-foreground">
            {detailsText}
          </pre>
        </div>
      )}
      {canRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="mt-1 gap-2"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t('spTryAgain')}
        </Button>
      )}
    </div>
  )
}
