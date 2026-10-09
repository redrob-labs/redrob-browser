/**
 * @license
 * Copyright 2026 Redrob and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

// chrome.storage-backed themeStorage, as an in-memory item with the same three calls.
let stored: string | null = null
mock.module('./theme-storage', () => ({
  themeStorage: {
    getValue: async () => stored,
    setValue: async (v: string) => {
      stored = v
    },
    watch: () => () => {},
  },
}))

const { applyTheme, mirroredTheme, readTheme, resolveTheme, writeTheme } =
  await import('./browser-color-scheme')

type G = { chrome?: unknown; localStorage?: Storage; matchMedia?: unknown }
const g = globalThis as unknown as G

function fakeLocalStorage(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size
    },
  }
}

let browserScheme = 'system'
const setCalls: string[] = []

beforeEach(() => {
  stored = null
  browserScheme = 'system'
  setCalls.length = 0
  g.localStorage = fakeLocalStorage()
  g.chrome = {
    redrobPrivate: {
      getColorScheme: (cb: (s: string) => void) => cb(browserScheme),
      setColorScheme: (s: string) => {
        setCalls.push(s)
        browserScheme = s
      },
    },
  }
})

afterEach(() => {
  g.chrome = undefined
})

describe('browser colour scheme', () => {
  it('takes the browser value as the truth and brings both copies up to it', async () => {
    stored = 'light'
    browserScheme = 'dark'
    expect(await readTheme()).toBe('dark')
    expect(stored).toBe('dark')
    expect(mirroredTheme()).toBe('dark')
  })

  it('writes a choice to the browser, so the window re-themes too', async () => {
    await writeTheme('light')
    expect(setCalls).toEqual(['light'])
    expect(stored).toBe('light')
    expect(mirroredTheme()).toBe('light')
  })

  it('treats an unknown browser value as system rather than painting it', async () => {
    browserScheme = 'sepia'
    expect(await readTheme()).toBe('system')
  })

  it('falls back to the extension store where redrobPrivate is absent', async () => {
    g.chrome = {}
    stored = 'dark'
    expect(await readTheme()).toBe('dark')
    await writeTheme('light')
    expect(setCalls).toEqual([])
    expect(stored).toBe('light')
  })

  it('resolves system from the platform, and sets both markers the stylesheets read', () => {
    g.matchMedia = () => ({ matches: true })
    expect(resolveTheme('system')).toBe('dark')
    expect(resolveTheme('light')).toBe('light')
    const classes = new Set<string>()
    const root = {
      dataset: {} as Record<string, string>,
      classList: {
        toggle: (c: string, on: boolean) =>
          on ? classes.add(c) : classes.delete(c),
      },
    }
    applyTheme('dark', root as unknown as HTMLElement)
    expect(root.dataset.theme).toBe('dark')
    expect([...classes]).toEqual(['dark'])
  })
})
