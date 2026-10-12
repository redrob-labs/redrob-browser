/**
 * @license
 * Copyright 2026 Redrob and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {
  getLocale,
  hasLocaleChoice,
  type Locale,
  setLocale,
  t,
} from '@browseros/i18n'
import { Monitor, Moon, Sun } from '@browseros/icons'
import type { FC, KeyboardEvent } from 'react'
import {
  SettingsGroup,
  SettingsRow,
} from '@/components/settings/SettingsLayout'
import { useTheme } from '@/components/theme-provider'
import type { Theme } from '@/lib/theme/theme-storage'

const THEMES = [
  { value: 'system', icon: Monitor, label: 'appearanceThemeSystem' },
  { value: 'light', icon: Sun, label: 'appearanceThemeLight' },
  { value: 'dark', icon: Moon, label: 'appearanceThemeDark' },
] as const satisfies readonly {
  value: Theme
  icon: typeof Monitor
  label: Parameters<typeof t>[0]
}[]

/** Each language is named in itself, never translated into the current one (the system's LangSwitch). */
const LANGS: { code: Locale; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ko', label: '한국어' },
]

/**
 * The design system's ThemeSwitch (`.rr-theme`): system, light and dark as one radio group with a roving
 * tabindex and arrow keys. It writes through the app's ThemeProvider, which hands the choice to the
 * browser (redrobPrivate.setColorScheme), so this page, the side panel and the browser frame agree.
 */
const ThemeSwitch: FC = () => {
  const { theme, setTheme } = useTheme()
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const i = THEMES.findIndex((o) => o.value === theme)
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? 2
          : 0
    if (!step) return
    event.preventDefault()
    const next = THEMES[(i + step) % THEMES.length]
    setTheme(next.value)
    event.currentTarget
      .querySelector<HTMLElement>(`[data-theme-opt="${next.value}"]`)
      ?.focus()
  }
  return (
    <div
      className="rr-theme"
      role="radiogroup"
      aria-labelledby="appearance-theme"
      onKeyDown={onKey}
    >
      {THEMES.map(({ value, icon: Icon, label }) => (
        // biome-ignore lint/a11y/useSemanticElements: see the group
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          aria-label={t(label)}
          title={t(label)}
          data-theme-opt={value}
          tabIndex={theme === value ? 0 : -1}
          className="rr-theme__opt"
          onClick={() => setTheme(value)}
        >
          <Icon aria-hidden="true" className="size-4" />
        </button>
      ))}
    </div>
  )
}

/**
 * The design system's LangSwitch (`.rr-lang`), inline for two languages. Each entry leads to THIS page in
 * that language: choosing one stores it and reloads in place.
 */
const LangSwitch: FC = () => {
  const current = getLocale()
  return (
    <nav className="rr-lang" aria-labelledby="appearance-language">
      <ul className="rr-lang__list">
        {LANGS.map(({ code, label }) => (
          <li key={code} className="rr-lang__item">
            {code === current ? (
              <span className="rr-lang__on" aria-current="true" lang={code}>
                {label}
              </span>
            ) : (
              <a
                className="rr-lang__link"
                href={location.hash || '#'}
                lang={code}
                hrefLang={code}
                onClick={(event) => {
                  event.preventDefault()
                  setLocale(code)
                }}
              >
                {label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}

export const AppearanceSettings: FC = () => (
  <SettingsGroup title={t('appearanceGroup')}>
    <SettingsRow
      label={t('appearanceTheme')}
      labelId="appearance-theme"
      description={t('appearanceThemeHint')}
    >
      <ThemeSwitch />
    </SettingsRow>
    <SettingsRow
      label={t('appearanceLanguage')}
      labelId="appearance-language"
      description={
        hasLocaleChoice() ? (
          <>
            {t('appearanceLanguageChosen')}{' '}
            <button
              type="button"
              className="rr-btn rr-btn--sm rr-btn--ghost ui-inline-btn"
              onClick={() => setLocale(null)}
            >
              {t('appearanceLanguageReset')}
            </button>
          </>
        ) : (
          t('appearanceLanguageHint')
        )
      }
    >
      <LangSwitch />
    </SettingsRow>
  </SettingsGroup>
)
