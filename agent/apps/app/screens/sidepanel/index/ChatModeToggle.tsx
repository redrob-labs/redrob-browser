/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { type MessageKey, t } from '@browseros/i18n'
import { MessageSquare, MousePointer2 } from '@browseros/icons'
import type { FC } from 'react'
import type { ChatMode } from '@/modules/chat/chat-types'

export interface ChatModeToggleProps {
  mode: ChatMode
  onModeChange: (mode: ChatMode) => void
}

const MODES: {
  value: ChatMode
  label: MessageKey
  hint: MessageKey
  icon: typeof MousePointer2
}[] = [
  {
    value: 'agent',
    label: 'sidepanelModeAgent',
    hint: 'sidepanelModeAgentHint',
    icon: MousePointer2,
  },
  {
    value: 'chat',
    label: 'sidepanelModeChat',
    hint: 'sidepanelModeChatHint',
    icon: MessageSquare,
  },
]

/**
 * The design system's ComposerMode (`.rr-cmode`): both modes visible as a radio group beside the
 * composer, so the current one is read from the selection rather than from a pill that says "ON".
 * Each option's label is its accessible name and its hint its title, which still holds in the 400px
 * panel, where the system shows the icons only.
 */
export const ChatModeToggle: FC<ChatModeToggleProps> = ({
  mode,
  onModeChange,
}) => (
  <div
    className="rr-cmode"
    role="radiogroup"
    aria-label={t('sidepanelModeGroup')}
  >
    {MODES.map(({ value, label, hint, icon: Icon }) => (
      <button
        key={value}
        type="button"
        role="radio"
        aria-checked={mode === value}
        aria-label={t(label)}
        title={t(hint)}
        className="rr-cmode__o"
        onClick={() => mode !== value && onModeChange(value)}
      >
        <Icon aria-hidden="true" className="size-[13px]" />
        <span className="rr-cmode__l">{t(label)}</span>
      </button>
    ))}
  </div>
)
