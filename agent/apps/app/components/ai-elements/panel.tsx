/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { Panel as PanelPrimitive } from '@xyflow/react'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

type PanelProps = ComponentProps<typeof PanelPrimitive>

/**
 * @public
 */
export const Panel = ({ className, ...props }: PanelProps) => (
  <PanelPrimitive
    className={cn(
      'm-4 overflow-hidden rounded-md border bg-card p-1',
      className,
    )}
    {...props}
  />
)
