/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

export type ActivityCardCaptionTone = 'light' | 'blue'

export const activityCardCaptionTones = {
  light: {
    surface: 'bg-card text-cyanotype-ink',
    subdued: 'text-cyanotype-soft',
  },
  blue: {
    surface: 'bg-cyanotype-blue text-white',
    subdued: 'text-white/70',
  },
} as const satisfies Record<
  ActivityCardCaptionTone,
  { surface: string; subdued: string }
>
