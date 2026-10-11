/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The result of one comparison, in the side panel. Lowest first, then a row per store, then what
 * was not checked, said as "not checked", never as "no cheaper price": a store that refused is a
 * gap in the answer, and the card's last line says how many stores it actually read.
 *
 * Prices are the design system's Money (the reader's own number convention); the match is its
 * Confidence. Variants (another colour, refurbished) are listed as similar, never as the lowest.
 */

import {
  formatRelative,
  getLocale,
  type MessageKey,
  t,
  tNodes,
} from '@browseros/i18n'
import { RefreshCw } from '@browseros/icons'
import type { Comparison, StoreResult } from '@browseros/shopping/compare'
import type { Region } from '@browseros/shopping/stores'
import { Confidence, Money } from '@redrob-labs/ui'
import { type FC, useEffect, useRef } from 'react'

export const REGION_NAME: Record<Region, MessageKey> = {
  KR: 'compareRegionKR',
  IN: 'compareRegionIN',
  US: 'compareRegionUS',
}

const NOT_CHECKED: Record<string, MessageKey> = {
  blocked: 'compareStoreBlocked',
  'sign-in': 'compareStoreSignIn',
  timeout: 'compareStoreTimeout',
  failed: 'compareStoreFailed',
}

function storeName(result: StoreResult): string {
  if (getLocale() !== 'ko') return result.name
  return result.store === 'coupang'
    ? '쿠팡'
    : result.store === 'naver'
      ? '네이버쇼핑'
      : result.name
}

const Price: FC<{ amount: number; currency: string }> = ({
  amount,
  currency,
}) => <Money amount={amount} currency={currency} locale={getLocale()} />

export interface SmartCompareCardProps {
  result: Comparison
  region: Region
  onRegionChange: (region: Region) => void
  onRefresh: () => void
  refreshing?: boolean
}

export const SmartCompareCard: FC<SmartCompareCardProps> = ({
  result,
  region,
  onRegionChange,
  onRefresh,
  refreshing,
}) => {
  const ref = useRef<HTMLElement>(null)
  // A result arriving while the person reads the chat is brought into view, not left below it.
  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, [result.checkedAt])
  const checked = result.stores.filter(
    (s) => s.outcome.status === 'ok' || s.outcome.status === 'none',
  ).length
  const lowest = result.lowest
  const lowestStore = result.stores.find((s) => s.store === lowest?.store)
  const own = result.product.price

  return (
    <section
      ref={ref}
      className="rr-card space-y-3 p-4"
      aria-label={t('compareTitle')}
    >
      <header className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-[14px]">{t('compareTitle')}</div>
          <div
            className="truncate text-[12px] text-[var(--text-secondary)]"
            translate="no"
          >
            {result.product.title}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <label className="sr-only" htmlFor="compare-region">
            {t('compareRegionLabel')}
          </label>
          <select
            id="compare-region"
            className="rr-select rr-select--sm"
            value={region}
            onChange={(event) => onRegionChange(event.target.value as Region)}
          >
            {(['KR', 'IN', 'US'] as const).map((r) => (
              <option key={r} value={r}>
                {t(REGION_NAME[r])}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rr-iconbtn rr-iconbtn--sm"
            aria-label={t('compareRefresh')}
            title={t('compareRefresh')}
            disabled={refreshing}
            onClick={onRefresh}
          >
            <RefreshCw className="size-[14px]" />
          </button>
        </div>
      </header>

      {lowest && lowestStore ? (
        <div>
          <div className="font-semibold text-[16px]">
            {tNodes<React.ReactNode>(
              'compareLowest',
              <Price
                key="p"
                amount={lowest.listing.price.amount}
                currency={lowest.listing.price.currency}
              />,
              storeName(lowestStore),
            )}
          </div>
          {result.saving !== undefined && own ? (
            <div className="text-[13px] text-[var(--text-secondary)]">
              {result.saving > 0
                ? tNodes(
                    'compareLess',
                    <Price
                      key="s"
                      amount={result.saving}
                      currency={own.currency}
                    />,
                  )
                : t('compareMore')}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-[13px]">{t('compareNoneFound')}</p>
      )}

      <ul className="divide-y divide-[var(--border-subtle)] text-[13px]">
        {result.stores.map((store) => {
          const name = storeName(store)
          const outcome = store.outcome
          if (outcome.status === 'ok') {
            return (
              <li key={store.store} className="space-y-1 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{name}</span>
                  <span className="flex items-center gap-2">
                    <Price
                      amount={outcome.best.price.amount}
                      currency={outcome.best.price.currency}
                    />
                    <a
                      className="rr-btn rr-btn--ghost rr-btn--sm"
                      href={outcome.best.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t('compareOpen')}
                    </a>
                  </span>
                </div>
                <div
                  className="truncate text-[12px] text-[var(--text-secondary)]"
                  translate="no"
                >
                  {outcome.best.title}
                </div>
                <Confidence
                  level={
                    outcome.best.confidence === 3
                      ? 'high'
                      : outcome.best.confidence === 2
                        ? 'medium'
                        : 'low'
                  }
                  label={
                    outcome.best.reason === 'model'
                      ? t('compareSure')
                      : t('compareLikely')
                  }
                />
                {outcome.variants.slice(0, 1).map((variant) => (
                  <div
                    key={variant.productId}
                    className="text-[12px] text-[var(--text-tertiary)]"
                  >
                    {tNodes(
                      'compareVariant',
                      <a
                        key="v"
                        href={variant.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        translate="no"
                      >
                        {variant.title}
                      </a>,
                    )}{' '}
                    <Price
                      amount={variant.price.amount}
                      currency={variant.price.currency}
                    />
                  </div>
                ))}
              </li>
            )
          }
          const key =
            outcome.status === 'none'
              ? 'compareStoreNone'
              : NOT_CHECKED[outcome.status]
          return (
            <li
              key={store.store}
              className="flex items-center justify-between gap-2 py-2"
            >
              <span className="text-[var(--text-secondary)]">
                {t(key ?? 'compareStoreFailed', name)}
              </span>
              {outcome.status !== 'none' ? (
                <a
                  className="rr-btn rr-btn--ghost rr-btn--sm shrink-0"
                  href={store.searchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('compareOpenStore', name)}
                </a>
              ) : null}
            </li>
          )
        })}
        {own ? (
          <li className="flex items-center justify-between gap-2 py-2">
            <span className="text-[var(--text-secondary)]">
              {t('compareThisPage')}
            </span>
            <Price amount={own.amount} currency={own.currency} />
          </li>
        ) : null}
      </ul>

      <footer className="space-y-0.5 text-[12px] text-[var(--text-tertiary)]">
        <div>
          {t(
            'compareChecked',
            checked,
            result.stores.length,
            formatRelative(result.checkedAt),
          )}
        </div>
        <div>{t('compareTabsNote', t('compareTitle'))}</div>
      </footer>
    </section>
  )
}
