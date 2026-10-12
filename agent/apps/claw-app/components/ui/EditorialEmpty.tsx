/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { type MessageKey, tNodes } from '@browseros/i18n'

interface EditorialEmptyProps {
  /** The whole line, with the accent word as $1, so a translation can put it where its grammar needs. */
  line: MessageKey
  /** The italic Newsreader accent word (the app's signature move). */
  accent: string
  /** Mono ink-3 hint line under the accent line. */
  hint: string
}

/**
 * Shared editorial empty state used across cockpit / audit / MCP.
 * No card, no lucide icon. A Newsreader italic accent line in the
 * same voice as the cockpit hero ("What are your agents *working
 * on* right now?"), followed by a mono hint. Screen-specific copy
 * lives at the call site.
 */
export function EditorialEmpty({
  line,
  accent,
  hint,
}: EditorialEmptyProps) {
  return (
    <div className="py-20 text-center">
      <p className="font-extrabold text-2xl leading-tight tracking-tight md:text-3xl">
        {tNodes(
          line,
          <span key="a" className="font-medium font-serif text-accent italic">
            {accent}
          </span>,
        )}
      </p>
      <p className="mt-3 font-mono text-[12px] text-ink-3">{hint}</p>
    </div>
  )
}
