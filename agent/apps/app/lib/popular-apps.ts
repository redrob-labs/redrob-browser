/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { MessageKey } from '@browseros/i18n'

/**
 * The popular apps Redrob works with out of the box.
 *
 * There is no connector behind these. The agent drives the user's own tabs, and the user is already
 * signed in to these sites in this browser, so "open the report in my Drive" is a navigation the
 * agent makes in a tab, under the account the user sees in the address bar. That is why there is
 * nothing to install, nothing to authorize, and no third party between the user and their mail.
 */
export interface PopularApp {
  id: string
  /** Key into McpServerIcon's icon map. */
  icon: string
  /** Short label, translated where the product has a local name (Drive is 드라이브). */
  label: MessageKey
  url: string
  /** One sentence the user could send as-is. Picking the app puts it in the composer. */
  examplePrompt: MessageKey
}

export const POPULAR_APPS: readonly PopularApp[] = [
  {
    id: 'gmail',
    icon: 'Gmail',
    label: 'paGmail',
    url: 'https://mail.google.com/',
    examplePrompt: 'paGmailExample',
  },
  {
    id: 'drive',
    icon: 'Google Drive',
    label: 'paDrive',
    url: 'https://drive.google.com/',
    examplePrompt: 'paDriveExample',
  },
  {
    id: 'calendar',
    icon: 'Google Calendar',
    label: 'paCalendar',
    url: 'https://calendar.google.com/',
    examplePrompt: 'paCalendarExample',
  },
  {
    id: 'youtube',
    icon: 'YouTube',
    label: 'paYouTube',
    url: 'https://www.youtube.com/',
    examplePrompt: 'paYouTubeExample',
  },
  {
    id: 'notion',
    icon: 'Notion',
    label: 'paNotion',
    url: 'https://www.notion.so/',
    examplePrompt: 'paNotionExample',
  },
  {
    id: 'slack',
    icon: 'Slack',
    label: 'paSlack',
    url: 'https://app.slack.com/client',
    examplePrompt: 'paSlackExample',
  },
  {
    id: 'github',
    icon: 'GitHub',
    label: 'paGitHub',
    url: 'https://github.com/',
    examplePrompt: 'paGitHubExample',
  },
  {
    id: 'figma',
    icon: 'Figma',
    label: 'paFigma',
    url: 'https://www.figma.com/files/',
    examplePrompt: 'paFigmaExample',
  },
]
