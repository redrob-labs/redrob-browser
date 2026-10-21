/**
 * @license
 * Copyright 2025 BrowserOS
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { t } from '@browseros/i18n'
import { ExternalLink, Settings } from '@browseros/icons'
import type { FC, ReactNode } from 'react'
import { useState } from 'react'
import { McpServerIcon } from '@/components/mcp/McpServerIcon'
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { POPULAR_APPS } from '@/lib/popular-apps'

export interface AppSelectorProps {
  children: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  /**
   * Puts an app's example request in the composer. Without it, picking an app opens the app in a
   * new tab instead.
   */
  onPickPrompt?: (prompt: string) => void
}

/**
 * The composer's Apps menu. It lists the popular apps the agent works in through the user's own
 * signed-in tabs: picking one shows what to ask, so a person who has never used the agent sees a
 * request that works instead of an empty box. Nothing here connects or authorizes anything.
 */
export const AppSelector: FC<AppSelectorProps> = ({
  children,
  side = 'bottom',
  onPickPrompt,
}) => {
  const [open, setOpen] = useState(false)

  const openInTab = (url: string) => {
    window.open(url, '_blank')?.focus()
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side={side}
        align="end"
        className="w-80 p-0"
        role="dialog"
        aria-label={t('paMenuTitle')}
      >
        <Command className="[&_svg:not([class*='text-'])]:text-muted-foreground">
          <div className="px-3 pt-3 pb-1">
            <div className="font-medium text-sm">{t('paMenuTitle')}</div>
            <p className="mt-0.5 text-muted-foreground text-xs">
              {t('paMenuLede')}
            </p>
          </div>
          <CommandList className="max-h-72 overflow-auto">
            <CommandGroup>
              {POPULAR_APPS.map((app) => (
                <CommandItem
                  key={app.id}
                  value={t(app.label)}
                  onSelect={() => {
                    if (!onPickPrompt) return openInTab(app.url)
                    onPickPrompt(t(app.examplePrompt))
                    setOpen(false)
                  }}
                  className="flex cursor-pointer items-center gap-3 px-3 py-2"
                >
                  <McpServerIcon
                    serverName={app.icon}
                    size={18}
                    className="shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm">
                      {t(app.label)}
                    </span>
                    <span className="block truncate text-muted-foreground text-xs">
                      {t(app.examplePrompt)}
                    </span>
                  </div>
                  <button
                    type="button"
                    title={t('paOpenApp')}
                    aria-label={`${t('paOpenApp')}: ${t(app.label)}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      openInTab(app.url)
                    }}
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          <button
            type="button"
            onClick={() =>
              openInTab(chrome.runtime.getURL('/app.html#/connect-apps'))
            }
            className="flex w-full items-center gap-2 border-border border-t px-3 py-2 text-muted-foreground text-xs hover:bg-accent hover:text-foreground"
          >
            <Settings className="h-3.5 w-3.5" />
            {t('stManageApps')}
          </button>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
