/**
 * @license
 * Copyright 2026 Redrob and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { t } from '@browseros/i18n'
import { type FC, useEffect, useState } from 'react'
import {
  SettingsGroup,
  SettingsRow,
} from '@/components/settings/SettingsLayout'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getQuickWindowShortcut,
  isQuickWindowApiAvailable,
  QUICK_WINDOW_SHORTCUTS,
  type QuickWindowShortcut,
  setQuickWindowShortcut,
  shortcutLabel,
} from '@/lib/redrob/quick-window'
import { useIsMac } from '@/lib/useIsMac'

/**
 * The quick window's global shortcut (CAP-5): one of a few presets, or off.
 *
 * Presets rather than a key recorder, deliberately: the browser registers this combination with the OS,
 * and a free choice would let it capture a key every other application needs. The browser accepts only
 * these ids (redrobPrivate.setQuickWindowShortcut) and maps them to Ctrl, or Command on macOS.
 */
export const QuickWindowSettingsCard: FC = () => {
  const isMac = useIsMac() ?? false
  const [preset, setPreset] = useState<QuickWindowShortcut | null>(null)
  const available = isQuickWindowApiAvailable()

  useEffect(() => {
    if (!available) return
    let live = true
    void getQuickWindowShortcut().then((value) => {
      if (live) setPreset(value)
    })
    return () => {
      live = false
    }
  }, [available])

  // Without the browser API there is no window to configure, and a control that changes nothing would
  // be the one thing worse than no row.
  if (!available) return null

  return (
    <SettingsGroup title={t('qwSettingsGroup')}>
      <SettingsRow
        label={t('qwShortcut')}
        labelId="quick-window-shortcut"
        description={t('qwShortcutHint')}
      >
        <Select
          value={preset ?? undefined}
          disabled={preset === null}
          onValueChange={(value) => {
            const next = value as QuickWindowShortcut
            setPreset(next)
            setQuickWindowShortcut(next)
          }}
        >
          <SelectTrigger
            aria-labelledby="quick-window-shortcut"
            className="min-w-48"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {QUICK_WINDOW_SHORTCUTS.map((value) => (
              <SelectItem key={value} value={value}>
                {shortcutLabel(value, isMac) ?? t('qwShortcutOff')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsRow>
    </SettingsGroup>
  )
}
