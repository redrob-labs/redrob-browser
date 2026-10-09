/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import * as SwitchPrimitive from '@radix-ui/react-switch'
import type * as React from 'react'

import { cn } from '@/lib/utils'

/** @public */
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        // .rr-switch__track's metrics on Radix's button: 40x24, a 2px inset, strong-border ground off and
        // brand fill on, the system's ring, half opacity when disabled.
        'peer inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full p-0.5 outline-none transition-colors duration-[var(--duration-fast)] focus-visible:outline-[length:var(--focus-ring-width)] focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-[var(--focus-ring-width)] focus-visible:outline-solid disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-[var(--action-primary)] data-[state=unchecked]:bg-[var(--border-strong)]',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          // .rr-switch__thumb: 20px white with shadow-sm, travelling 16px on the system's settle curve.
          'pointer-events-none block size-5 rounded-full bg-[var(--redrob-white)] shadow-[var(--shadow-sm)] transition-transform duration-[var(--duration-base)] ease-[var(--easing-settle)] data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0',
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
