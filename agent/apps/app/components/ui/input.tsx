/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import type * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * @public
 */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // The system's field (.rr-control): 40px, field radius, strong border, brand border and a
        // brand-subtle halo on focus, danger border when invalid, sunken when disabled.
        'rr-control rr-control--md min-w-0 file:inline-flex file:h-7 file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
