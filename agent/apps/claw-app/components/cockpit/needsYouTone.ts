/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

// The needs-you attention tone: the system's Orange 4 (status-warning in light), fixed in both themes
// because white on the dark theme's Orange 3 fails AA. White on Orange 4 is 5.3:1; Orange 5 when pressed.
//
// surface: filled caption plate on the running card.
// action:  the primary action on a pale surface (banner, in-control bar).
export const needsYouTone = {
  surface: 'bg-[var(--accent-orange-4)] text-white',
  action:
    'bg-[var(--accent-orange-4)] text-white hover:bg-[var(--accent-orange-5)]',
} as const
