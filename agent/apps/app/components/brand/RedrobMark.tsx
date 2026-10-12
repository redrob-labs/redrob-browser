/**
 * @license
 * Copyright 2026 Redrob and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The Redrob symbol, from the design system delivery's own artwork.
 *
 * Two files, one per ground, and both in the DOM: the gradient symbol belongs on white and light grounds,
 * the solid-white one on redrob-black and dark surfaces (assets/Symbol/README.md in the delivery). The
 * theme decides which shows, as the design system's own .rr-mark does. A single file cannot serve both --
 * the hand-drawn #000921 silhouette this replaces read at 1.00:1 on the dark page -- and recolouring one
 * through a mask or a filter is the modification the logo spec forbids.
 *
 * The files are byte copies of sources/chrome/browser/resources/redrob/brand/, pinned by sha256 in
 * DESIGN_SYSTEM_PIN.json; RedrobMark.test.ts fails if a copy stops matching. Never edit them.
 */

import onLight from '@/assets/brand/redrob-symbol.png'
import onDark from '@/assets/brand/redrob-symbol-solid-white.png'
import { cn } from '@/lib/utils'

export interface RedrobMarkProps {
  /** What the mark names where it stands: "Redrob", "Redrob Code", "Redrob Console". */
  alt?: string
  className?: string
  size?: number | string
}

export function RedrobMark({
  alt = 'Redrob',
  className,
  size,
}: RedrobMarkProps) {
  // The box is always definite -- from `size`, else from the caller's size-* class, else 1em -- and both
  // images fill it. An image with no box renders at its file's natural size: the 320px white symbol
  // spilled across the page the first time a caller passed only a size prop.
  const px = typeof size === 'number' ? `${size}px` : size
  return (
    <span
      className={cn('ui-mark inline-flex size-[1em] shrink-0', className)}
      style={px ? { width: px, height: px } : undefined}
    >
      <img
        src={onLight}
        alt={alt}
        className="ui-mark__light size-full object-contain"
      />
      <img
        src={onDark}
        alt=""
        aria-hidden
        className="ui-mark__dark size-full object-contain"
      />
    </span>
  )
}
