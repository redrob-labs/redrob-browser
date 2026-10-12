/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { t } from '@browseros/i18n'
import { Info, Keyboard } from '@browseros/icons'
import type { FC } from 'react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export interface SidebarUserFooterProps {
  expanded?: boolean
  onOpenShortcuts?: () => void
}

export const SidebarUserFooter: FC<SidebarUserFooterProps> = ({
  expanded = true,
  onOpenShortcuts,
}) => {
  // const signInButton = (
  //   <Button
  //     variant="outline"
  //     className="h-9 w-full justify-start gap-2 overflow-hidden whitespace-nowrap px-3"
  //     disabled
  //   >
  //     <LogIn className="size-4 shrink-0" />
  //     <span
  //       className={cn(
  //         'truncate transition-opacity duration-200',
  //         expanded ? 'opacity-100' : 'opacity-0',
  //       )}
  //     >
  //       Sign in to Redrob
  //     </span>
  //   </Button>
  // )

  // The browser's own About page. A plain link cannot open a chrome:// URL from
  // an extension page, so the tab is created through the API.
  const aboutLink = (
    <button
      type="button"
      onClick={() => chrome.tabs.create({ url: 'chrome://settings/help' })}
      className="ui-shell-link flex h-9 w-full items-center gap-2 overflow-hidden whitespace-nowrap px-3"
    >
      <Info className="size-4 shrink-0" />
      <span
        className={cn(
          'truncate transition-opacity duration-200',
          expanded ? 'opacity-100' : 'opacity-0',
        )}
      >
        {t('shAboutRedrob')}
      </span>
    </button>
  )

  const shortcutsButton = (
    <Button
      variant="ghost"
      onClick={onOpenShortcuts}
      className="ui-shell-link flex h-9 w-full items-center justify-start gap-2 overflow-hidden whitespace-nowrap px-3"
    >
      <Keyboard className="size-4 shrink-0" />
      <span
        className={cn(
          'truncate transition-opacity duration-200',
          expanded ? 'opacity-100' : 'opacity-0',
        )}
      >
        {t('shShortcuts')}
      </span>
    </Button>
  )

  return (
    <TooltipProvider delayDuration={0}>
      <div className="mt-auto space-y-1 border-t p-2">
        {expanded ? (
          shortcutsButton
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>{shortcutsButton}</TooltipTrigger>
            <TooltipContent side="right">{t('shShortcuts')}</TooltipContent>
          </Tooltip>
        )}

        {expanded ? (
          aboutLink
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>{aboutLink}</TooltipTrigger>
            <TooltipContent side="right">{t('shAboutRedrob')}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  )
}
