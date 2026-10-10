/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'

import { cn } from '@/lib/utils'

const alertVariants = cva(
  // .rr-alert: --radius-md, --space-4 inset, ink-primary title, ink-secondary text.
  'relative grid w-full grid-cols-[0_1fr] items-start gap-y-[var(--space-1)] rounded-[var(--radius-md)] border p-[var(--space-4)] text-[14px] leading-[22px] has-[>svg]:grid-cols-[20px_1fr] has-[>svg]:gap-x-[var(--space-3)] [&>svg]:size-5 [&>svg]:translate-y-px [&>svg]:text-current',
  {
    variants: {
      variant: {
        default:
          'border-[var(--border-subtle)] bg-[var(--surface-raised)] text-[var(--ink-primary)]',
        destructive:
          // .rr-alert--danger, light and dark
          'border-[var(--accent-red-2)] bg-[var(--accent-red-1)] text-[var(--ink-primary)] [&>svg]:text-[var(--status-danger)] dark:border-[var(--accent-red-4)] dark:bg-[var(--accent-red-5)] dark:text-[var(--accent-red-1)]',
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
function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

/**
 * @public
 */
function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        'col-start-2 line-clamp-1 min-h-4 font-semibold text-[14px] leading-5',
        className,
      )}
      {...props}
    />
  )
}

/**
 * @public
 */
function AlertDescription({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        'col-start-2 grid justify-items-start gap-1 text-[14px] text-[var(--ink-secondary)] leading-[22px]',
        className,
      )}
      {...props}
    />
  )
}

export { Alert, AlertDescription, AlertTitle }
