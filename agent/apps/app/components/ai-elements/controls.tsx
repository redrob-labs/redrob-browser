/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

'use client'

import { Controls as ControlsPrimitive } from '@xyflow/react'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export type ControlsProps = ComponentProps<typeof ControlsPrimitive>

/**
 * @public
 */
export const Controls = ({ className, ...props }: ControlsProps) => (
  <ControlsPrimitive
    className={cn(
      'gap-px overflow-hidden rounded-md border bg-card p-1 shadow-none!',
      '[&>button]:rounded-md [&>button]:border-none! [&>button]:bg-transparent! [&>button]:hover:bg-secondary!',
      className,
    )}
    {...props}
  />
)
