/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { cn } from "@/lib/utils"
import { IconLoader } from "@tabler/icons-react"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <IconLoader role="status" aria-label="Loading" className={cn("size-4 animate-spin", className)} {...props} />
  )
}

export { Spinner }
