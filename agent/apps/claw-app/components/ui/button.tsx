/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * The design system's Button and IconButton (`.rr-btn`, `.rr-iconbtn` in @redrob-labs/ui's styles.css):
 * height, padding, radius, weight, tone, hover and the 2px focus ring all come from there. The cva keeps
 * only what the system leaves to the host -- svg sizing and the disabled pointer rule -- so a variant
 * name maps to a system class and nothing Tailwind paints competes with it.
 */
const buttonVariants = cva(
  "group/button shrink-0 cursor-pointer whitespace-nowrap select-none disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "",
        outline: "",
        secondary: "",
        ghost: "",
        destructive: "",
        link: "h-auto! border-0! bg-transparent! p-0! text-[var(--ink-brand)] underline-offset-4 hover:underline",
      },
      size: {
        default: "",
        xs: "",
        sm: "",
        lg: "",
        icon: "",
        "icon-xs": "",
        "icon-sm": "",
        "icon-lg": "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

type Variant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>

/** The system's own classes for a variant and size (the same table as apps/app's button). */
function rrClasses(variant?: Variant | null, size?: string | null): string {
  const v = variant ?? "default"
  const s = size ?? "default"
  if (v === "link") return ""
  const step = s.endsWith("lg") ? "lg" : s.endsWith("sm") || s.endsWith("xs") ? "sm" : "md"
  if (s.startsWith("icon")) {
    const tone =
      v === "default"
        ? " rr-iconbtn--primary"
        : v === "outline" || v === "secondary"
          ? " rr-iconbtn--secondary"
          : ""
    return `rr-iconbtn rr-iconbtn--${step}${tone}${v === "destructive" ? " text-[var(--status-danger)]" : ""}`
  }
  const tone = { default: "primary", destructive: "danger", outline: "secondary", secondary: "secondary", ghost: "ghost" }[v]
  return `rr-btn rr-btn--${step} rr-btn--${tone}`
}

/** Exported so a caller styling a link as a button gets the system's button too. */
function buttonVariantsWithSystem(options: Parameters<typeof buttonVariants>[0] = {}): string {
  return cn(rrClasses(options?.variant, options?.size), buttonVariants(options))
}

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(rrClasses(variant, size), buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Button, buttonVariantsWithSystem as buttonVariants }
