/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from '@browseros/icons'
import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { useTheme } from '@/components/theme-provider'

/**
 * @public
 */
const Toaster = ({ ...props }: ToasterProps) => {
  // Our provider, not next-themes': nothing mounts a next-themes provider, so that hook always said 'system'.
  const { theme } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: 'shadow-[var(--shadow-lg)]! font-sans',
          // i18n-ignore: class names, not copy
          title: 'font-semibold! text-[14px]! leading-5!',
          // i18n-ignore: class names, not copy
          description: 'text-[13px]! leading-5! text-[var(--ink-secondary)]!',
          success: '[&_[data-icon]]:text-[var(--status-success)]',
          error: '[&_[data-icon]]:text-[var(--status-danger)]',
          warning: '[&_[data-icon]]:text-[var(--status-warning)]',
          info: '[&_[data-icon]]:text-[var(--status-info)]',
        },
      }}
      closeButton
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          // .rr-toast: raised ground, subtle border, radius-md, shadow-lg; the status icon carries the tone.
          '--normal-bg': 'var(--surface-raised)',
          '--normal-text': 'var(--ink-primary)',
          '--normal-border': 'var(--border-subtle)',
          '--border-radius': 'var(--radius-md)',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
