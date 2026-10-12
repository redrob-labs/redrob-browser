/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { t, tNodes } from '@browseros/i18n'

export function CockpitHero() {
  return (
    <header>
      <h1
        className="flex flex-wrap items-baseline gap-[9px] pt-1 font-extrabold font-sans text-[28px] text-cyanotype-ink leading-[1.15] tracking-[-0.025em]"
        data-cockpit-hero
      >
        {/* One sentence with the accent as $1; the text either side keeps its segment name. */}
        {tNodes(
          'clHeroLine',
          <span
            key="accent"
            className="font-bold text-cyanotype-blue italic"
            data-cockpit-hero-segment="accent"
          >
            {t('clWorkingOn')}
          </span>,
        ).map((part, i) =>
          typeof part === 'string'
            ? part.trim() && (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: a fixed sentence split around one node
                  key={i}
                  data-cockpit-hero-segment={i === 0 ? 'lead' : 'tail'}
                >
                  {part.trim()}
                </span>
              )
            : part,
        )}
      </h1>
    </header>
  )
}
