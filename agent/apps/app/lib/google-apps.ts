/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { MessageKey } from '@browseros/i18n'

/**
 * The Google apps Redrob works with out of the box.
 *
 * There is no connector behind these. The agent drives the user's own tabs, and the user is already
 * signed in to Google in this browser, so "open the report in my Drive" is a navigation the agent
 * makes in a tab, under the account the user sees in the address bar. That is why there is nothing
 * to install, nothing to authorize, and no third party between the user and their mail.
 *
 * `name` doubles as the key into McpServerIcon's icon map.
 */
export interface GoogleApp {
  id: 'gmail' | 'drive' | 'docs' | 'calendar'
  name: 'Gmail' | 'Google Drive' | 'Google Docs' | 'Google Calendar'
  url: string
  /** One sentence the user could send as-is. Picking the app puts it in the composer. */
  examplePrompt: MessageKey
}

export const GOOGLE_APPS: readonly GoogleApp[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    url: 'https://mail.google.com/',
    examplePrompt: 'gaGmailExample',
  },
  {
    id: 'drive',
    name: 'Google Drive',
    url: 'https://drive.google.com/',
    examplePrompt: 'gaDriveExample',
  },
  {
    id: 'docs',
    name: 'Google Docs',
    url: 'https://docs.google.com/document/',
    examplePrompt: 'gaDocsExample',
  },
  {
    id: 'calendar',
    name: 'Google Calendar',
    url: 'https://calendar.google.com/',
    examplePrompt: 'gaCalendarExample',
  },
]

/** Where a user who is not signed in to Google goes. */
export const GOOGLE_SIGN_IN_URL = 'https://accounts.google.com/'
