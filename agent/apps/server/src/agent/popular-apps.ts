/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * How the agent works with the user's everyday apps. There is no connector: the user is signed in to
 * these sites in this browser, so the agent opens the app in a tab and works in it like the user
 * would. For Google apps, search goes straight to the app's own search URL rather than through its
 * UI, which is the step that most often goes wrong. Shared by the chat agent's system prompt and the
 * MCP server's instructions so the two say the same thing.
 */
export const POPULAR_APPS_GUIDANCE = `The user's apps (Gmail, Google Drive, Docs, Sheets, Calendar, YouTube, Notion, Slack, Outlook, Teams, GitHub, Figma and other sites) are reached in browser tabs. The user is signed in to them in this browser, so there is nothing to connect: open the app's site and work in it.
- Find a Drive file: open https://drive.google.com/drive/search?q=<words> with the URL-encoded words from the user's request, then open the matching result. If several match, list them and ask which one.
- Find Gmail mail: open https://mail.google.com/mail/u/0/#search/<words> (Gmail search operators such as from:, subject:, newer_than: work in <words>).
- Google Calendar: open https://calendar.google.com/calendar/r and read the view; to add an event, use the Create button.
- New document: https://docs.new, spreadsheet: https://sheets.new, slides: https://slides.new.
- Other apps: open the app's own site (notion.so, app.slack.com, outlook.office.com, teams.microsoft.com, github.com, figma.com) and use its search box.
- If a sign-in page appears instead, stop and tell the user to sign in in that tab, then continue when they say so. Never type a password.
- Ask the user before anything that sends, shares, deletes or changes their data (sending mail or a message, sharing a file, deleting, accepting an invite).`
