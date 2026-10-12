/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { t } from '@browseros/i18n'
import { ChevronDown, Loader2, Plus } from '@browseros/icons'
import { type FC, useState } from 'react'
import { McpServerIcon } from '@/components/mcp/McpServerIcon'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

export interface AvailableManagedServersProps {
  availableServers?: { name: string; description: string }[]
  onAddServer: (args: { name: string; description: string }) => void
  isLoading?: boolean
}

export const AvailableManagedServers: FC<AvailableManagedServersProps> = ({
  availableServers,
  onAddServer,
  isLoading,
}) => {
  const [isOpen, setIsOpen] = useState(true)

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="ui-card p-5">
        <CollapsibleTrigger className="ui-disclosure flex w-full cursor-pointer items-center justify-between">
          <div className="flex flex-col items-start">
            <h2 className="ui-settings-row__label">{t('stBuiltInApps')}</h2>
            <p className="text-muted-foreground text-sm">
              {isLoading
                ? t('stLoading')
                : t('stAppsAvailable', availableServers?.length ?? 0)}
            </p>
          </div>
          <ChevronDown
            className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </CollapsibleTrigger>

        <CollapsibleContent className="pt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {availableServers?.map((args) => {
                const { name: serverName, description } = args
                return (
                  <Button
                    key={serverName}
                    variant="outline"
                    onClick={() => onAddServer(args)}
                    className="ui-card-btn group flex-col items-start gap-2 p-4"
                  >
                    <div className="flex w-full items-center justify-between">
                      <div className="flex items-center gap-3">
                        <McpServerIcon
                          serverName={serverName}
                          size={20}
                          className="text-[var(--ink-secondary)]"
                        />
                        <span className="font-medium">{serverName}</span>
                      </div>
                      <Plus className="h-4 w-4 text-[var(--ink-muted)] group-hover:text-[var(--ink-brand)]" />
                    </div>
                    {description && (
                      <p className="line-clamp-1 max-w-48 text-ellipsis text-left text-muted-foreground text-xs">
                        {description}
                      </p>
                    )}
                  </Button>
                )
              }) ?? null}
            </div>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
