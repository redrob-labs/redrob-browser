/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { t } from '@browseros/i18n'
import { Monitor, Moon, Sun } from '@browseros/icons'
import type { FC } from 'react'
import type { ClassNameValue } from 'tailwind-merge'
import { useTheme } from '@/components/theme-provider'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Theme } from '@/lib/theme/theme-storage'
import { cn } from '@/lib/utils'

const themes: { value: Theme; icon: typeof Monitor; label: string }[] = [
  { value: 'system', icon: Monitor, label: t('stSystem') },
  { value: 'light', icon: Sun, label: t('stLight') },
  { value: 'dark', icon: Moon, label: t('stDark') },
]

export interface ThemeToggleProps {
  hideLabel?: boolean
  iconClassName?: ClassNameValue
  className?: ClassNameValue
}

/**
 * @public
 */
export const ThemeToggle: FC<ThemeToggleProps> = ({
  hideLabel = true,
  iconClassName,
  className,
}) => {
  const { theme, setTheme } = useTheme()

  const currentTheme = themes.find((t) => t.value === theme)
  const CurrentIcon = currentTheme?.icon || Monitor

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={hideLabel ? 'icon' : 'default'}
          aria-label={t('stCurrentTheme', currentTheme?.label ?? '')}
          className={cn(className)}
        >
          <CurrentIcon className={cn('h-5 w-5', iconClassName)} />
          {!hideLabel && (
            <span>{currentTheme?.label || t('appearanceTheme')}</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => setTheme(value as Theme)}
        >
          {themes.map(({ value, icon: Icon, label }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
