/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'

import { cn } from '@/lib/utils'

function Tabs({
  className,
  orientation = 'horizontal',
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        'group/tabs flex gap-2 data-[orientation=horizontal]:flex-col',
        className,
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  // .rr-tabs__list: --space-1 between pills; a line list carries the subtle rule and --space-5 gaps.
  'group/tabs-list inline-flex w-fit items-center justify-center gap-[var(--space-1)] font-sans group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col',
  {
    variants: {
      variant: {
        default: '',
        line: 'gap-[var(--space-5)] border-[var(--border-subtle)] border-b',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function TabsList({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        // .rr-tab: 14px SemiBold in ink-secondary, the system's ring. Pill (default): 36px, radius-full,
        // sunken on hover, brand fill when selected. Line: an underline in brand, ink-brand when selected.
        "relative inline-flex items-center justify-center gap-[var(--space-2)] whitespace-nowrap font-semibold text-[14px] text-[var(--ink-secondary)] transition-colors duration-[var(--duration-fast)] focus-visible:outline-[length:var(--focus-ring-width)] focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid focus-visible:outline-offset-[var(--focus-ring-width)] disabled:pointer-events-none disabled:opacity-50 group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        'group-data-[variant=default]/tabs-list:h-9 group-data-[variant=default]/tabs-list:rounded-full group-data-[variant=default]/tabs-list:px-[var(--space-4)] group-data-[variant=default]/tabs-list:data-[state=active]:bg-[var(--action-primary)] group-data-[variant=default]/tabs-list:data-[state=active]:text-[var(--ink-on-brand)] group-data-[variant=default]/tabs-list:hover:bg-[var(--surface-sunken)] group-data-[variant=default]/tabs-list:hover:text-[var(--ink-primary)]',
        '-mb-px group-data-[variant=line]/tabs-list:border-transparent group-data-[variant=line]/tabs-list:border-b-2 group-data-[variant=line]/tabs-list:py-[var(--space-3)] group-data-[variant=line]/tabs-list:data-[state=active]:border-[var(--action-primary)] group-data-[variant=line]/tabs-list:data-[state=active]:text-[var(--ink-brand)] group-data-[variant=line]/tabs-list:hover:text-[var(--ink-primary)]',
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn('flex-1', className)}
      {...props}
    />
  )
}

export { Tabs, TabsContent, TabsList, TabsTrigger, tabsListVariants }
