/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { getLocale, t } from '@browseros/i18n'
import { type Region, storesFor } from '@browseros/shopping/stores'
import type { FC } from 'react'

/**
 * "Compare prices", above the composer while the tab shows a product. A `.rr-prompt` pill, the same
 * anatomy as a suggested reply: it is a thing to ask, not a setting. Nothing runs until it is pressed,
 * because a comparison opens tabs.
 */
export const SmartCompareChip: FC<{
  region: Region
  busy?: boolean
  onCompare: () => void
}> = ({ region, busy, onCompare }) => {
  const stores = storesFor(region).map((s) => s.name)
  let list = stores.join(', ')
  try {
    list = new Intl.ListFormat(getLocale(), { type: 'disjunction' }).format(
      stores,
    )
  } catch {}
  return (
    <button
      type="button"
      className="rr-prompt"
      title={t('compareChipHint', list)}
      disabled={busy}
      aria-busy={busy}
      onClick={onCompare}
    >
      {busy ? t('compareSearching', list) : t('compareChip')}
    </button>
  )
}
