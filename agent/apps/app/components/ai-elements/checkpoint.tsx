/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

'use client'

import { BookmarkIcon, type LucideProps } from '@browseros/icons'
import type { ComponentProps, HTMLAttributes } from 'react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export type CheckpointProps = HTMLAttributes<HTMLDivElement>

/** @public */
export const Checkpoint = ({
  className,
  children,
  ...props
}: CheckpointProps) => (
  <div
    className={cn(
      'flex items-center gap-0.5 overflow-hidden text-muted-foreground',
      className,
    )}
    {...props}
  >
    {children}
    <Separator />
  </div>
)

export type CheckpointIconProps = LucideProps

/** @public */
export const CheckpointIcon = ({
  className,
  children,
  ...props
}: CheckpointIconProps) =>
  children ?? (
    <BookmarkIcon className={cn('size-4 shrink-0', className)} {...props} />
  )

export type CheckpointTriggerProps = ComponentProps<typeof Button> & {
  tooltip?: string
}

/** @public */
export const CheckpointTrigger = ({
  children,
  className,
  variant = 'ghost',
  size = 'sm',
  tooltip,
  ...props
}: CheckpointTriggerProps) =>
  tooltip ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size={size} type="button" variant={variant} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent align="start" side="bottom">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  ) : (
    <Button size={size} type="button" variant={variant} {...props}>
      {children}
    </Button>
  )
