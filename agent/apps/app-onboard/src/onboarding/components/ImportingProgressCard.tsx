/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { t } from '@browseros/i18n'
import { RefreshCw, X } from '@browseros/icons'
import { Button } from '@/components/ui/button'
import type { BrowserOSImportItem } from '../browseros-onboarding-api'
import { importItemLabel } from '../onboarding-v2.helpers'

interface ImportingProgressCardProps {
  currentItemLabel?: string
  progress: number
  sourceLabel?: string
  total: number
  /** The items this import was asked for, in checklist order. */
  items?: readonly BrowserOSImportItem[]
  completedItems?: readonly BrowserOSImportItem[]
  currentItem?: BrowserOSImportItem
  onCancel?: () => void
}

type ItemState = 'done' | 'copying' | 'waiting'

function itemStateFor(
  item: BrowserOSImportItem,
  completedItems: readonly BrowserOSImportItem[],
  currentItem: BrowserOSImportItem | undefined,
): ItemState {
  if (completedItems.includes(item)) return 'done'
  if (item === currentItem) return 'copying'
  return 'waiting'
}

function itemStateLabel(state: ItemState): string {
  if (state === 'done') return t('onboardItemStateDone')
  if (state === 'copying') return t('onboardItemStateCopying')
  return t('onboardItemStateWaiting')
}

/**
 * Displays import progress while selected source data is copied: an overall
 * bar, then one bar per item type. The importer reports when each item starts
 * and ends, not how far through one it is, so an item's bar is empty, moving
 * (indeterminate) or full -- never a made-up percentage.
 */
export function ImportingProgressCard({
  currentItemLabel,
  progress,
  sourceLabel,
  total,
  items = [],
  completedItems = [],
  currentItem,
  onCancel,
}: ImportingProgressCardProps) {
  const percent = total === 0 ? 0 : Math.min(100, (progress / total) * 100)
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-xl border border-border-2 bg-card p-5"
    >
      <div className="mb-3.5 flex items-center gap-2.5">
        <RefreshCw className="size-[18px] animate-spin text-accent" />
        <span className="font-bold text-[14px]">
          {t('onboardImporting', currentItemLabel ?? 'data')}
        </span>
      </div>
      {sourceLabel && (
        <div className="mb-3 font-bold text-[12px] text-ink-2">
          {sourceLabel}
        </div>
      )}
      <div className="mb-2.5 h-2 overflow-hidden rounded-full bg-bg-sunken">
        <div
          className="h-full bg-accent transition-[width] duration-100"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="text-[12.5px] text-ink-2 tabular-nums">
        {t('onboardItems', progress, total)}
      </div>
      {items.length > 0 && (
        <ul
          aria-label={t('onboardImportProgressByItem')}
          className="mt-4 flex flex-col gap-2.5"
        >
          {items.map((item) => {
            const state = itemStateFor(item, completedItems, currentItem)
            return (
              <li key={item} className="flex items-center gap-3">
                <span className="w-32 shrink-0 text-[12.5px] text-ink">
                  {importItemLabel(item)}
                </span>
                <div
                  role="progressbar"
                  aria-label={importItemLabel(item)}
                  aria-valuemin={0}
                  aria-valuemax={1}
                  aria-valuenow={state === 'done' ? 1 : 0}
                  aria-valuetext={itemStateLabel(state)}
                  className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-sunken"
                >
                  <div
                    className={
                      state === 'copying'
                        ? 'h-full w-1/3 animate-pulse rounded-full bg-accent'
                        : 'h-full bg-accent transition-[width] duration-100'
                    }
                    style={
                      state === 'copying'
                        ? undefined
                        : { width: state === 'done' ? '100%' : '0%' }
                    }
                  />
                </div>
                <span className="w-20 shrink-0 text-right text-[12px] text-ink-3">
                  {itemStateLabel(state)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {onCancel && (
        <div className="mt-4 flex justify-end">
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            <X className="size-3.5" />
            {t('onboardCancelImport')}
          </Button>
        </div>
      )}
    </div>
  )
}
