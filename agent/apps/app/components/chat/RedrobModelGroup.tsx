/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { t } from '@browseros/i18n'
import { Check } from '@browseros/icons'
import { useQueryClient } from '@tanstack/react-query'
import type { FC } from 'react'
import { toast } from 'sonner'
import { CommandGroup, CommandItem } from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { putProvider } from '@/modules/llm-providers/llm-providers.api'
import { useProvidersQuery } from '@/modules/llm-providers/llm-providers.hooks'
import { modelRows } from '@/modules/models/featured-models'

/**
 * Below the agents, when the selected agent is Redrob Console: Redrob Auto first, then one model per
 * lab. Choosing one saves it as that provider's model; the provider's stored key is untouched, because
 * the server keeps credential fields a request leaves out.
 */
export const RedrobModelGroup: FC<{
  providerId: string
  onDone: () => void
}> = ({ providerId, onDone }) => {
  const { data: providers = [] } = useProvidersQuery()
  const queryClient = useQueryClient()
  const config = providers.find((p) => p.id === providerId)
  if (!config || config.type !== 'redrob-console') return null

  const choose = async (modelId: string) => {
    onDone()
    if (modelId === config.modelId) return
    try {
      const { apiKey: _kept, ...rest } = config
      await putProvider({ ...rest, modelId })
      await queryClient.invalidateQueries({ queryKey: ['llm-providers'] })
    } catch {
      toast.error(t('modelSaveFailed'))
    }
  }

  return (
    <CommandGroup heading={t('modelGroup')}>
      {modelRows(config.modelId, t('modelAuto')).map((row) => {
        const selected =
          row.modelId === config.modelId ||
          (row.kind === 'auto' && config.modelId === 'redrob/auto')
        return (
          <CommandItem
            key={row.modelId}
            value={`model ${row.name} ${row.lab ?? ''}`}
            onSelect={() => void choose(row.modelId)}
            className={cn(
              'flex w-full items-center gap-3 rounded-md p-2',
              selected && 'bg-[var(--accent-brand)]/10',
            )}
          >
            <span className="min-w-0 flex-1 text-left">
              <span
                className="block truncate text-sm"
                translate={row.kind === 'auto' ? undefined : 'no'}
              >
                {row.name}
                {row.lab ? (
                  <span className="text-muted-foreground"> · {row.lab}</span>
                ) : null}
              </span>
              <span className="block truncate text-muted-foreground text-xs">
                {row.note ? t(row.note) : t('modelCurrent')}
              </span>
            </span>
            {selected && (
              <Check className="h-3.5 w-3.5 text-[var(--accent-brand-ink)]" />
            )}
          </CommandItem>
        )
      })}
      <CommandItem
        value="model all settings"
        onSelect={() => {
          window.open('/app.html#/settings/ai', '_blank')
          onDone()
        }}
        className="p-2 text-muted-foreground text-xs"
      >
        {t('modelAll')}
      </CommandItem>
    </CommandGroup>
  )
}
