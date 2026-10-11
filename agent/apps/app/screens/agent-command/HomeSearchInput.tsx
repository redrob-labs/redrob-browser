/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Search } from '@browseros/icons'
import { type FC, type FormEvent, useState } from 'react'
import { resolveSearchInput } from '@/lib/newtab/search-input'

/**
 * The new tab's Search box: an address opens in this tab, anything else goes
 * to the browser's default search engine (chrome.search, so the user's own
 * engine choice in settings is what runs, never one this page picks).
 */
export const HomeSearchInput: FC = () => {
  const [value, setValue] = useState('')

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const target = resolveSearchInput(value)
    if (target.kind === 'empty') return
    if (target.kind === 'url') {
      const tab = await chrome.tabs.getCurrent()
      if (tab?.id !== undefined) {
        await chrome.tabs.update(tab.id, { url: target.url })
      } else {
        window.location.assign(target.url)
      }
      return
    }
    await chrome.search.query({
      text: target.text,
      disposition: 'CURRENT_TAB',
    })
  }

  return (
    <form
      aria-label="Search"
      onSubmit={handleSubmit}
      className="ui-composer flex items-center gap-3 overflow-hidden px-5 py-4"
    >
      <Search aria-hidden className="size-5 shrink-0 text-[var(--ink-muted)]" />
      <input
        // biome-ignore lint/a11y/noAutofocus: the new tab exists to be typed into
        autoFocus
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search the web or type a URL"
        aria-label="Search the web or type a URL"
        autoComplete="off"
        spellCheck={false}
        className="ui-composer-input min-w-0 flex-1 bg-transparent outline-none"
      />
    </form>
  )
}
