/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { REPORTER_EXTENSION_ID } from '@browseros/diagnostics/contract'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'wxt'
import { archiveSourceMaps } from './lib/build/archive-source-maps'
import { LEGACY_AGENT_EXTENSION_ID } from './lib/constants/legacyAgentExtensionId'
import { PRODUCT_WEB_HOST } from './lib/constants/productWebHost'

// biome-ignore lint/style/noProcessEnv: build config file needs env access
const env = process.env

// See https://wxt.dev/api/config.html
// Extension ID will be oikpnmkappjhkifbcieakjoeiknojbgg (Redrob's signing key)
export default defineConfig({
  outDir: 'dist',
  modules: ['@wxt-dev/module-react'],
  hooks: {
    // All Vite builds (including Sentry uploads) finish before this hook; WXT's
    // ZIP and the release CRX packer then consume the extension without maps.
    'build:done': (wxt, output) => archiveSourceMaps(wxt.config, output),
  },
  manifest: {
    // From l10n/extension/00-manifest.tsv via _locales, so chrome://extensions shows the browser's language.
    name: '__MSG_manifestName__',
    default_locale: 'en',
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAkZ34Lwqovf0N+i2kqZivoxE0r5ZS5gjiUmz3c0v9+dSzMGaLw17o96HtufNe9s5ox9AKNkuGzhkBzl8rfeR2kCpxBvBnNXJdyNT8IGUZJrUnj0mQReR3V3J/9KXejLV6PeelyztL7zvO0BUZYqMDtQYYrrDW622U55Ym8FEZhhnQNAOLY8vbD13Csr2j1X0mzl+SuKPyTWb0jWGkqmGWOLO/13Gc5qRZbLqELEycDAHdqwZ5MZlMzQydNdvIgyXZmJog3npameXueiNeG46RVSh9b22eeIF7XrFnUnpfWQ+HYDb07CMKLSC2M0ccvRFcV0UWSt1P8ofOiDvWPn7ltQIDAQAB',
    // Redrob's own CDN. The browser forces this channel for the agent id anyway
    // (extension_management.cc), so the two must name the same manifest.
    update_url: 'https://cdn.redrob.ai/browser/extensions/update-manifest.xml',
    // The bug reporter is the only thing that connects in. The account site
    // used to as well, to hand its sign-in result back to the extension.
    externally_connectable: {
      ids: [REPORTER_EXTENSION_ID],
    },
    web_accessible_resources: [
      {
        resources: ['app.html'],
        matches: [
          `https://${PRODUCT_WEB_HOST}/*`,
          `https://*.${PRODUCT_WEB_HOST}/*`,
        ],
        extension_ids: [LEGACY_AGENT_EXTENSION_ID],
      },
    ],
    chrome_url_overrides: {
      newtab: 'app.html',
    },
    options_ui: {
      page: 'app.html#/settings',
      open_in_tab: true,
    },
    action: {
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
      default_title: '__MSG_manifestActionTitle__',
    },
    permissions: [
      'system.cpu',
      'system.memory',
      'topSites',
      'storage',
      'unlimitedStorage',
      'scripting',
      'tabs',
      'tabGroups',
      'sidePanel',
      'bookmarks',
      'history',
      'browserOS',
      // Component-only; stock Chromium warns about them and loads the extension anyway.
      // getColorScheme / setColorScheme: one theme for the window and these pages.
      // redrobPrivate.privacy: the saved-secret scan Privacy Protection asks the browser for
      // (positions only, never values).
      'redrobPrivate',
      'redrobPrivate.privacy',
      'alarms',
      'webNavigation',
      'downloads',
      'search',
    ],
    host_permissions: ['http://127.0.0.1/*'],
    // The team policy arrives as a Chromium managed policy for this extension
    // (3rdparty.extensions.<id>.teamPolicy). See apps/server/src/lib/privacy/team-policy/source.ts.
    storage: { managed_schema: 'managed_schema.json' },
  },
  vite: () => ({
    build: {
      sourcemap: 'hidden',
    },
    plugins: [
      tailwindcss(),
      ...(env.SENTRY_AUTH_TOKEN
        ? [
            sentryVitePlugin({
              org: env.SENTRY_ORG,
              project: env.SENTRY_PROJECT,
              authToken: env.SENTRY_AUTH_TOKEN,
              // archiveSourceMaps retains full maps after every upload finishes.
            }),
          ]
        : []),
    ],
  }),
})
