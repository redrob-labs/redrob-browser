/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { CheckIcon } from '@browseros/icons'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import type * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * @public
 */
function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        // .rr-choice__box's metrics on Radix's button: 18px, radius-xs, strong border on the base ground,
        // brand fill when checked, the system's 2px ring at a 2px offset, sunken when disabled.
        'peer inline-flex size-[18px] shrink-0 items-center justify-center rounded-[var(--radius-xs)] border border-[var(--border-strong)] bg-[var(--surface-base)] text-[var(--ink-on-brand)] outline-none transition-colors duration-[var(--duration-fast)] focus-visible:outline-[length:var(--focus-ring-width)] focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid focus-visible:outline-offset-[var(--focus-ring-width)] disabled:cursor-not-allowed disabled:border-[var(--border-subtle)] disabled:bg-[var(--surface-sunken)] aria-invalid:border-[var(--status-danger)] data-[state=checked]:border-[var(--action-primary)] data-[state=checked]:bg-[var(--action-primary)]',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        <CheckIcon className="size-3" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
