/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/** .rr-badge.rr-badge--sm: the system's 20px pill and its tones. */
const badgeVariants = cva(
  "rr-badge rr-badge--sm w-fit shrink-0 justify-center gap-1 overflow-hidden whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2",
  {
    variants: {
      variant: {
        default: "rr-badge--solid rr-badge--brand",
        secondary: "rr-badge--subtle rr-badge--neutral",
        destructive: "rr-badge--subtle rr-badge--danger",
        outline: "rr-badge--outline rr-badge--neutral",
        ghost: "rr-badge--subtle rr-badge--neutral bg-transparent",
        link: "bg-transparent text-[var(--ink-brand)] underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
