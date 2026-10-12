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
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // The system's textarea (.rr-control.rr-textarea); it still grows with its content.
        'rr-control rr-textarea field-sizing-content flex',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
