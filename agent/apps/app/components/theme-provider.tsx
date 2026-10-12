/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { createContext, useContext, useEffect, useState } from 'react'
import {
  applyTheme,
  mirroredTheme,
  readTheme,
  resolveTheme,
  writeTheme,
} from '@/lib/theme/browser-color-scheme'
import { type Theme, themeStorage } from '@/lib/theme/theme-storage'

export type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
  theme: 'system',
  setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

/**
 * The theme is the BROWSER's colour scheme (lib/theme/browser-color-scheme.ts): choosing one here
 * re-themes the window, and choosing one in the browser's Settings re-themes this page when it is next
 * shown. The first value is the synchronous mirror, applied in main.tsx before render, so no frame is
 * painted in the wrong theme.
 *
 * @public
 */
export function ThemeProvider({
  children,
  defaultTheme,
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(
    () => defaultTheme ?? mirroredTheme(),
  )

  useEffect(() => {
    let live = true
    const refresh = () => {
      readTheme().then((next) => {
        if (live) setThemeState(next)
      })
    }
    refresh()
    // Another page of this extension changed it: chrome.storage tells every page at once.
    const unwatch = themeStorage.watch((next) => {
      if (next) setThemeState(next)
    })
    // The browser's Settings changed it: there is no event for that, so ask again whenever this page
    // comes back into view, which is the first moment a difference could be seen.
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', refresh)
    return () => {
      live = false
      unwatch()
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  useEffect(() => {
    applyTheme(resolveTheme(theme))
    if (theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const follow = () => applyTheme(resolveTheme('system'))
    media.addEventListener('change', follow)
    return () => media.removeEventListener('change', follow)
  }, [theme])

  const value = {
    theme,
    setTheme: (next: Theme) => {
      setThemeState(next)
      void writeTheme(next)
    },
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error('useTheme must be used within a ThemeProvider')

  return context
}
