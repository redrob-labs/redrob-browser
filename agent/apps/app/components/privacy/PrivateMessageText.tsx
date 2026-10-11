/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { t } from '@browseros/i18n'
import type { FC } from 'react'
import type { MessagePiece } from '@/modules/privacy/private-spans'

/**
 * A person's own message, with each detail the AI saw as a placeholder marked.
 *
 * The design system's PrivateText anatomy (`.rr-private`: a dotted underline, focusable, with the
 * explanation in a title and again as visually-hidden text, because a title alone is unreachable by
 * keyboard). Written here rather than imported because the component's sentence is fixed English.
 */
export const PrivateMessageText: FC<{ pieces: MessagePiece[] }> = ({
  pieces,
}) => (
  <p className="whitespace-pre-wrap break-words">
    {pieces.map((piece, index) => {
      if (piece.kind === 'text') {
        // biome-ignore lint/suspicious/noArrayIndexKey: pieces are a fixed split of one string.
        return <span key={index}>{piece.text}</span>
      }
      const said = t('privacyKeptAs', piece.as)
      return (
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the explanation must be reachable by keyboard.
        // biome-ignore lint/suspicious/noArrayIndexKey: pieces are a fixed split of one string.
        <span key={index} className="rr-private" tabIndex={0} title={said}>
          {piece.text}
          <span className="rr-visually-hidden"> ({said})</span>
        </span>
      )
    })}
  </p>
)
