/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import '@/styles/global.css'
import { ThemeProvider } from '@/components/theme-provider.tsx'
import { Toaster } from '@/components/ui/sonner'
import { AnalyticsProvider } from '@/lib/analytics/AnalyticsProvider.tsx'
import { QueryProvider } from '@/lib/query/QueryProvider'
import { sentryRootErrorHandler } from '@/lib/sentry/sentryRootErrorHandler.ts'
import {
  applyTheme,
  mirroredTheme,
  resolveTheme,
} from '@/lib/theme/browser-color-scheme'
import { App } from './App'

const $root = document.getElementById('root')

if ($root) {
  // Before the first render: a module script runs before first paint, so a dark page is never white.
  applyTheme(resolveTheme(mirroredTheme()))

  ReactDOM.createRoot($root, sentryRootErrorHandler).render(
    <React.StrictMode>
      <QueryProvider>
        <AnalyticsProvider>
          <ThemeProvider>
            <App />
            <Toaster />
          </ThemeProvider>
        </AnalyticsProvider>
      </QueryProvider>
    </React.StrictMode>,
  )
}
