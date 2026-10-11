/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { Plus } from '@browseros/icons'
import type { FC } from 'react'
import { SettingsHeader } from '@/components/settings/SettingsLayout'
import { Button } from '@/components/ui/button'

export interface ScheduledTasksHeaderProps {
  onAddClick: () => void
}

export const ScheduledTasksHeader: FC<ScheduledTasksHeaderProps> = ({
  onAddClick,
}) => {
  return (
    <SettingsHeader
      title="Scheduled Tasks"
      lede="Automate recurring browser tasks"
      actions={
        <Button onClick={onAddClick}>
          <Plus className="h-4 w-4" />
          New Task
        </Button>
      }
    />
  )
}
