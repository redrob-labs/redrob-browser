/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Teach Mode and playbook runs in the side panel: teaching, the draft it produces, and the run form.
 */

import { t } from '@browseros/i18n'
import type { Playbook } from '@browseros/playbooks/playbook'
import { draftFromEvents } from '@browseros/playbooks/teach'
import { useState } from 'react'
import { toast } from 'sonner'
import { draftPhrases } from './phrases'
import {
  playbooksForUrl,
  usePlaybookActions,
  usePlaybooks,
} from './playbooks.hooks'
import { useActiveTabUrl, useTeaching } from './teach.hooks'

export function usePlaybookPanel(options: {
  conversationId: string
  send: (message: string) => void
}) {
  const teaching = useTeaching()
  const actions = usePlaybookActions()
  const { data: playbooks = [] } = usePlaybooks()
  const activeUrl = useActiveTabUrl()
  const [draft, setDraft] = useState<Playbook | null>(null)
  const [running, setRunning] = useState<Playbook | null>(null)

  const finishTeaching = async () => {
    const events = await teaching.finish()
    // Drafted here, not on the server, so the steps are worded in the person's language.
    const made = draftFromEvents(events, {
      id: crypto.randomUUID(),
      now: Date.now(),
      phrases: draftPhrases(),
    })
    if (made.steps.length) setDraft(made)
    else toast.error(t('teachDraftFailed'))
  }
  const startRun = (playbook: Playbook, values: Record<string, string>) =>
    actions.start.mutate(
      { id: playbook.id, conversationId: options.conversationId, values },
      {
        onSuccess: (message) => {
          setRunning(null)
          options.send(message)
        },
        onError: () => toast.error(t('playbookRunFailed')),
      },
    )

  return {
    teaching,
    draft,
    setDraft,
    running,
    setRunning,
    finishTeaching,
    startRun,
    starting: actions.start.isPending,
    showing: Boolean(teaching.session || draft || running),
    runChips: teaching.session
      ? []
      : playbooksForUrl(playbooks, activeUrl).slice(0, 2),
    onTeach: teaching.session ? undefined : () => void teaching.start(),
  }
}

export type PlaybookPanel = ReturnType<typeof usePlaybookPanel>
