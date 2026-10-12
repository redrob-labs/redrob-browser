/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { t } from '@browseros/i18n'
import type { FC, ReactNode } from 'react'

export interface AddProviderTileProps {
  label: string
  icon: ReactNode
  onAdd: () => void
}

/**
 * One entry in the add-a-provider grid. Every entry uses this, so the action
 * reads the same whether it opens a key form, an OAuth flow or an agent
 * dialog. The whole tile is the button; the visible "Add" is an affordance
 * rather than a separate target, which keeps one tab stop per provider.
 */
export const AddProviderTile: FC<AddProviderTileProps> = ({
  label,
  icon,
  onAdd,
}) => (
  <button
    type="button"
    onClick={onAdd}
    aria-label={t('stAddName', label)}
    className="ui-pick group flex w-full items-center gap-3 p-3 text-left"
  >
    <span className="flex size-7 shrink-0 items-center justify-center text-[var(--ink-brand)]">
      {icon}
    </span>
    <span className="min-w-0 flex-1 truncate font-medium text-foreground text-sm">
      {label}
    </span>
    <span aria-hidden className="ui-pick__add shrink-0 px-2.5 py-1 text-xs">
      {t('stAdd')}
    </span>
  </button>
)
