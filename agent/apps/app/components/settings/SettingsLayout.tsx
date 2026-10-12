/**
 * @license
 * Copyright 2026 Redrob and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { FC, ReactNode } from 'react'
import { useId } from 'react'

/**
 * The settings page anatomy from the design system's page shell: a title and a lede on the page's own
 * ground (not a card around the heading), then groups. A group is a meta label over one card whose rows
 * are separated by rules -- the label names the group, so the rows never repeat it.
 */
export const SettingsHeader: FC<{
  title: ReactNode
  lede?: ReactNode
  /** The page's own actions, at the end of the title row (New task, Add app). */
  actions?: ReactNode
}> = ({ title, lede, actions }) => (
  <header className="ui-settings-head">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-2">
        <h1 className="ui-settings-head__title">{title}</h1>
        {lede && <p className="rr-panellede">{lede}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  </header>
)

export const SettingsGroup: FC<{
  title: ReactNode
  children: ReactNode
}> = ({ title, children }) => {
  const id = useId()
  return (
    <section aria-labelledby={id} className="ui-settings-group">
      <h2 id={id} className="ui-meta-label">
        {title}
      </h2>
      <div className="ui-card ui-settings-rows">{children}</div>
    </section>
  )
}

/** One setting: its name and what it does on the left, the control on the right. */
export const SettingsRow: FC<{
  label: ReactNode
  description?: ReactNode
  /** The control's id, so the name labels it. Omit for a group control that names itself. */
  htmlFor?: string
  labelId?: string
  children: ReactNode
}> = ({ label, description, htmlFor, labelId, children }) => (
  <div className="ui-settings-row">
    <div className="min-w-0 flex-1">
      {htmlFor ? (
        <label
          id={labelId}
          htmlFor={htmlFor}
          className="ui-settings-row__label"
        >
          {label}
        </label>
      ) : (
        <span id={labelId} className="ui-settings-row__label">
          {label}
        </span>
      )}
      {description && <p className="ui-settings-row__desc">{description}</p>}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
)
