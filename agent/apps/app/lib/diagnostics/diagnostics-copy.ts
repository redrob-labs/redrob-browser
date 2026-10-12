/**
 * @license
 * Copyright 2026 Redrob and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { type MessageKey, t } from '@browseros/i18n'

/** The diagnostics page's English copy, keyed: packages/diagnostics stays free of a localisation dependency. */
const KEYS: Record<string, MessageKey> = {
  Diagnostics: 'dgDiagnostics',
  'Diagnostics unavailable': 'dgUnavailableAll',
  Help: 'dgHelp',
  'Version and system details to help us troubleshoot.': 'dgLede',
  'Refreshing…': 'dgRefreshing',
  Refresh: 'dgRefresh',
  Copied: 'dgCopied',
  'Copy diagnostics': 'dgCopy',
  'Cached sample': 'dgCached',
  Collected: 'dgCollected',
  'Collecting diagnostics…': 'dgCollecting',
  'No sample available': 'dgNoSample',
  'Showing the previous sample.': 'dgPrevious',
  Versions: 'dgVersions',
  System: 'dgSystem',
  Memory: 'dgMemory',
  'At time of collection': 'dgAtTime',
  'Agent server': 'dgAgentServer',
  'MCP server': 'dgMcpServer',
  'App extension': 'dgAppExtension',
  'Bug Reporter extension': 'dgReporter',
  'Operating system': 'dgOs',
  Architecture: 'dgArch',
  Processor: 'dgCpu',
  'Logical cores': 'dgCores',
  'Total system memory': 'dgTotalMem',
  'Available system memory': 'dgFreeMem',
  Unavailable: 'dgUnavailable',
  'Copy includes these details and the collection time. No browsing history or account information.':
    'dgNote',
  'Clipboard unavailable. Select and copy these details:': 'dgClipboard',
}

/** Pass as DiagnosticsPage's `tr`. Text with no key (names such as Redrob, Chromium) is returned as given. */
export const diagnosticsCopy = (english: string): string => {
  const key = KEYS[english]
  return key ? t(key) : english
}
