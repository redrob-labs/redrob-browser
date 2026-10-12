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

/**
 * The design system's Button and IconButton (`.rr-btn`, `.rr-iconbtn` in @redrob-labs/ui's styles.css),
 * under shadcn's variant and size names so no call site changes. Option A: the look is the system's own
 * CSS; only the behaviour (Slot, Radix) stays local.
 *
 *   default -> primary      outline, secondary -> secondary (base ground, strong border)
 *   ghost   -> ghost (brand ink, brand-subtle hover)          destructive -> danger
 *   sm 32 / default 40 / lg 48: the system's control heights. shadcn's default was 36; the system has
 *   no 36, and a control between two steps is the drift this rework removes.
 * An icon size renders `.rr-iconbtn` at the same three heights. Focus is the system's 2px ring at a 2px
 * offset, from the class -- not shadcn's 3px translucent glow.
 */
const localVariants = cva(
  "[&_svg:not([class*='size-'])]:size-4 shrink-0 cursor-pointer whitespace-nowrap aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        default: '',
        destructive: '',
        outline: '',
        secondary: '',
        ghost: '',
        link: 'h-auto! border-0! bg-transparent! p-0! text-[var(--ink-brand)] underline-offset-4 hover:underline',
      },
      size: {
        default: '',
        sm: '',
        lg: '',
        icon: '',
        'icon-sm': '',
        'icon-lg': '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

type Variant =
  | 'default'
  | 'destructive'
  | 'outline'
  | 'secondary'
  | 'ghost'
  | 'link'
type Size = string

/** The system's own classes for a variant and size; the cva above only adds what the system leaves out. */
function rrClasses(
  variant: Variant | null | undefined,
  size: Size | null | undefined,
): string {
  const v = variant ?? 'default'
  const s = size ?? 'default'
  if (v === 'link') return ''
  const icon = s.startsWith('icon')
  const step = s.endsWith('lg')
    ? 'lg'
    : s.endsWith('sm') || s.endsWith('xs')
      ? 'sm'
      : 'md'
  if (icon) {
    const tone =
      v === 'default'
        ? ' rr-iconbtn--primary'
        : v === 'outline' || v === 'secondary'
          ? ' rr-iconbtn--secondary'
          : ''
    return `rr-iconbtn rr-iconbtn--${step}${tone}${v === 'destructive' ? ' text-[var(--status-danger)]' : ''}`
  }
  const tone = {
    default: 'primary',
    destructive: 'danger',
    outline: 'secondary',
    secondary: 'secondary',
    ghost: 'ghost',
  }[v]
  return `rr-btn rr-btn--${step} rr-btn--${tone}`
}

/**
 * @public
 */
/** The system's classes plus the local additions. Exported so a caller styling a link as a button
 * (alert-dialog's actions) gets the system's button too. */
function buttonVariants(
  options: Parameters<typeof localVariants>[0] = {},
): string {
  return cn(rrClasses(options?.variant, options?.size), localVariants(options))
}

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof localVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={buttonVariants({ variant, size, className })}
      {...props}
    />
  )
}

export { Button, buttonVariants }
