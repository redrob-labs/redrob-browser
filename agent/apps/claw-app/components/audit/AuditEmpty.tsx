/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { type MessageKey, t, tNodes } from '@browseros/i18n'

interface AuditEmptyProps {
  variant: 'search-miss' | 'zero-tasks' | 'error'
}

const COPY = {
  'search-miss': {
    line: 'clAuditNoMatchLine',
    accent: 'clMatches',
    hint: 'clTryClearingThemOrWidening',
  },
  'zero-tasks': {
    line: 'clAuditQuietLine',
    accent: 'clQuiet',
    hint: 'clAuditQuietHint',
  },
  error: {
    line: 'clAuditErrorLine',
    accent: 'clLoad',
    hint: 'clAuditErrorHint',
  },
} as const satisfies Record<
  string,
  Record<'line' | 'accent' | 'hint', MessageKey>
>

/**
 * Editorial empty state for the audit list. No card, no icon. A
 * Newsreader italic accent line in the same voice as the cockpit
 * hero ("What are your agents *working on* right now?"), followed
 * by a mono hint. Three variants: search-miss, zero-tasks, error.
 */
export function AuditEmpty({ variant }: AuditEmptyProps) {
  const copy = COPY[variant]
  return (
    <div className="py-20 text-center">
      <p className="font-extrabold text-2xl leading-tight tracking-tight md:text-3xl">
        {tNodes(
          copy.line,
          <span key="a" className="font-medium font-serif text-accent italic">
            {t(copy.accent)}
          </span>,
        )}
      </p>
      <p className="mt-3 font-mono text-[12px] text-ink-3">{t(copy.hint)}</p>
    </div>
  )
}
