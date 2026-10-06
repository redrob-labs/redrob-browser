/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { cn } from '@/lib/utils'
import { hexForSlug } from '@/screens/audit/audit.colors'

interface AgentDotProps {
  slug: string
  className?: string
}

export function AgentDot({ slug, className }: AgentDotProps) {
  return (
    <span
      className={cn('inline-block size-2 rounded-full', className)}
      style={{ background: hexForSlug(slug) }}
      aria-hidden
    />
  )
}
