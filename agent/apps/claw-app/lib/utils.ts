/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Tailwind class-merge helper. shadcn primitives expect this exact
 * signature at `@/lib/utils`; the alias is wired in tsconfig + the
 * shadcn CLI uses it when generating new components.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
