/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { t } from '@browseros/i18n'
import { Loader2, Plus } from '@browseros/icons'
import type { FC } from 'react'
import { Button } from '@/components/ui/button'
import { HubProviderRow } from './HubProviderRow'
import type { LlmHubProvider } from './models'

export interface HubProvidersListProps {
  providers: LlmHubProvider[]
  isLoading?: boolean
  onEditProvider: (index: number) => void
  onDeleteProvider: (index: number) => void
  onAddProvider: () => void
}

export const HubProvidersList: FC<HubProvidersListProps> = ({
  providers,
  isLoading = false,
  onEditProvider,
  onDeleteProvider,
  onAddProvider,
}) => {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-center gap-3 py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>{t('stLoadingProviders')}</span>
        </div>
      </div>
    )
  }

  if (providers.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-medium">{t('stConfiguredAiProviders')}</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={onAddProvider}
            className="border-[var(--accent-brand)] bg-[var(--accent-brand)]/10 text-[var(--accent-brand-ink)] hover:bg-[var(--accent-brand)]/20 hover:text-[var(--accent-brand-ink)]"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {t('stAddProvider')}
          </Button>
        </div>
        <div className="rounded-lg border border-border border-dashed py-8 text-center">
          <p className="text-muted-foreground text-sm">
            {t('stNoProvidersConfiguredYet')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-medium">{t('stConfiguredAiProviders')}</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={onAddProvider}
          className="border-[var(--accent-brand)] bg-[var(--accent-brand)]/10 text-[var(--accent-brand-ink)] hover:bg-[var(--accent-brand)]/20 hover:text-[var(--accent-brand-ink)]"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          {t('stAddProvider')}
        </Button>
      </div>
      <div className="space-y-3">
        {providers.map((provider, index) => (
          <HubProviderRow
            key={provider.url}
            provider={provider}
            canDelete={providers.length > 1}
            onEdit={() => onEditProvider(index)}
            onDelete={() => onDeleteProvider(index)}
          />
        ))}
      </div>
    </div>
  )
}
