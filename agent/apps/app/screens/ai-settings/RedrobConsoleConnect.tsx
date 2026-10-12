/**
 * @license
 * Copyright 2026 Redrob
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { t, tNodes } from '@browseros/i18n'
import { Check, ExternalLink, Link2, Loader2 } from '@browseros/icons'
import { type FC, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

/**
 * "Connect with Redrob Console": the console's device grant instead of a pasted key.
 *
 * The agent server runs the grant (the extension cannot reach the console itself) and hands back a handle,
 * a user code and the console's approval page. This opens that page, shows the code, and polls until the
 * console issues a workspace API key -- which goes into the form exactly where a pasted key would.
 */

type StartReply = {
  handle: string
  userCode: string
  verificationUri: string
  intervalMs: number
  error?: string
}
type PollReply =
  | { status: 'pending'; intervalMs: number }
  | { status: 'connected'; apiKey: string }
  | { status: 'denied' | 'expired' | 'unknown' }
  | { status: 'failed'; code: string }

type State =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'waiting'; userCode: string; verificationUri: string }
  | { kind: 'connected' }
  | { kind: 'error'; message: string }

export interface RedrobConsoleConnectProps {
  agentServerUrl: string | undefined
  onKey: (apiKey: string) => void
}

export const RedrobConsoleConnect: FC<RedrobConsoleConnectProps> = ({
  agentServerUrl,
  onKey,
}) => {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleRef = useRef<string | null>(null)

  // Leaving the dialog ends the attempt: no poll outlives the form it would fill.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      const handle = handleRef.current
      if (handle && agentServerUrl) {
        void fetch(`${agentServerUrl}/redrob-console/device/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ handle }),
        }).catch(() => undefined)
      }
    },
    [agentServerUrl],
  )

  async function poll(handle: string, delayMs: number) {
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `${agentServerUrl}/redrob-console/device/poll`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ handle }),
          },
        )
        const reply = (await res.json()) as PollReply
        if (reply.status === 'pending') {
          void poll(handle, reply.intervalMs)
          return
        }
        handleRef.current = null
        if (reply.status === 'connected') {
          onKey(reply.apiKey)
          setState({ kind: 'connected' })
          return
        }
        setState({
          kind: 'error',
          message:
            reply.status === 'denied'
              ? 'The connection was declined on the console.'
              : reply.status === 'expired' || reply.status === 'unknown'
                ? 'The code expired. Start again.'
                : 'The console could not finish the connection. Start again.',
        })
      } catch {
        // A blip between the app and its own server: try again on the same schedule.
        void poll(handle, delayMs)
      }
    }, delayMs)
  }

  async function start() {
    if (!agentServerUrl) {
      setState({
        kind: 'error',
        message: t('stTheRedrobAgentServerIs'),
      })
      return
    }
    setState({ kind: 'starting' })
    try {
      const res = await fetch(`${agentServerUrl}/redrob-console/device/start`, {
        method: 'POST',
      })
      const reply = (await res.json()) as StartReply
      if (!res.ok || reply.error)
        throw new Error(reply.error || `Server returned ${res.status}`)
      handleRef.current = reply.handle
      window.open(reply.verificationUri, '_blank')
      setState({
        kind: 'waiting',
        userCode: reply.userCode,
        verificationUri: reply.verificationUri,
      })
      void poll(reply.handle, reply.intervalMs)
    } catch (err) {
      setState({
        kind: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Could not start the connection.',
      })
    }
  }

  if (state.kind === 'connected') {
    return (
      <p className="flex items-center gap-1.5 text-sm">
        <Check className="size-4 text-primary" />
        {t('stConnectedToRedrobConsoleThe')}
      </p>
    )
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      {state.kind === 'waiting' ? (
        <div className="space-y-1.5 text-sm">
          <p>
            {tNodes(
              'stApproveWithCode',
              <span key="a" className="font-mono font-semibold tracking-wider">
                {state.userCode}
              </span>,
            )}
          </p>
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {t('stWaitingApproval')}{' '}
            <a
              href={state.verificationUri}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <ExternalLink className="size-3" />
              {t('stOpenTheConsoleAgain')}
            </a>
          </p>
        </div>
      ) : (
        <>
          <Button
            type="button"
            variant="outline"
            onClick={start}
            disabled={state.kind === 'starting'}
          >
            {state.kind === 'starting' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Link2 className="size-4" />
            )}
            {t('stConnectConsole')}
          </Button>
          <p className="text-muted-foreground text-xs">
            {t('stSignInOnTheConsole')}
          </p>
          {state.kind === 'error' && (
            <p className="text-destructive text-xs">{state.message}</p>
          )}
        </>
      )}
    </div>
  )
}
