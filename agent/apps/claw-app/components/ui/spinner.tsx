/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { cn } from "@/lib/utils"
import { Loader2 as IconLoader } from "@browseros/icons"

/** The system's spinner (.rr-spinner), named so a screen reader announces it as a live status. */
function Spinner({
  className,
  "aria-label": label = "Loading",
}: {
  className?: string
  "aria-label"?: string
}) {
  return <IconLoader aria-label={label} className={cn("size-4", className)} />
}

export { Spinner }
