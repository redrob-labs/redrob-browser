/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { t } from '@browseros/i18n'
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
      title={t('stScheduledTasks')}
      lede={t('stScheduledLede')}
      actions={
        <Button onClick={onAddClick}>
          <Plus className="h-4 w-4" />
          {t('stNewTask')}
        </Button>
      }
    />
  )
}
