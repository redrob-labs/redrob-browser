/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { CalendarClock, Plus } from '@browseros/icons'
import type { FC } from 'react'
import { Button } from '@/components/ui/button'

export interface ScheduledTasksHeaderProps {
  onAddClick: () => void
}

export const ScheduledTasksHeader: FC<ScheduledTasksHeaderProps> = ({
  onAddClick,
}) => {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-brand)]/10">
          <CalendarClock className="h-6 w-6 text-[var(--accent-brand-ink)]" />
        </div>
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-2">
            <h2 className="font-semibold text-xl">Scheduled Tasks</h2>
          </div>
          <p className="text-muted-foreground text-sm">
            Automate recurring browser tasks
          </p>
        </div>
        <Button
          onClick={onAddClick}
          className="border-[var(--accent-brand)] bg-[var(--accent-brand)]/10 text-[var(--accent-brand-ink)] hover:bg-[var(--accent-brand)]/20 hover:text-[var(--accent-brand-ink)]"
          variant="outline"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          New Task
        </Button>
      </div>
    </div>
  )
}
