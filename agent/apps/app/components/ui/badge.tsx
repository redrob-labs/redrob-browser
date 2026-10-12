/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  // .rr-badge.rr-badge--sm: 20px pill, 11px SemiBold. Tones below are the system's own.
  'rr-badge rr-badge--sm w-fit shrink-0 justify-center [&>svg]:pointer-events-none [&>svg]:size-3 focus-visible:outline-[length:var(--focus-ring-width)] focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-[var(--focus-ring-width)] focus-visible:outline-solid',
  {
    variants: {
      variant: {
        default: 'rr-badge--solid rr-badge--brand',
        secondary: 'rr-badge--subtle rr-badge--neutral',
        destructive: 'rr-badge--solid rr-badge--danger',
        outline: 'rr-badge--outline rr-badge--neutral',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

/**
 * @public
 */
function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span'

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
