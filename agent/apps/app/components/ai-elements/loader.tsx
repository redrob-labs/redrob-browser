/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export type LoaderProps = HTMLAttributes<HTMLDivElement> & {
  size?: number
}

/**
 * The design system's loading mark (`.rr-spinner`, as Streaming draws it): two raked ticks passing light,
 * sized by font-size. It replaced a hand-drawn sixteen-spoke wheel with round joins that spun.
 *
 * @public
 */
export const Loader = ({
  className,
  size = 16,
  style,
  ...props
}: LoaderProps) => (
  <div
    className={cn('inline-flex items-center justify-center', className)}
    {...props}
  >
    <span
      aria-hidden="true"
      className="rr-spinner"
      style={{ fontSize: `${size}px`, ...style }}
    />
  </div>
)
