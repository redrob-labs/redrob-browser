/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { NodeToolbar, Position } from '@xyflow/react'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

type ToolbarProps = ComponentProps<typeof NodeToolbar>

/**
 * @public
 */
export const Toolbar = ({ className, ...props }: ToolbarProps) => (
  <NodeToolbar
    className={cn(
      'flex items-center gap-1 rounded-sm border bg-background p-1.5',
      className,
    )}
    position={Position.Bottom}
    {...props}
  />
)
