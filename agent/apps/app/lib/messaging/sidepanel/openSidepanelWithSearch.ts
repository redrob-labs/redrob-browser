/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { defineExtensionMessaging } from '@webext-core/messaging'
import type { SearchActionStorage } from '@/lib/search-actions/searchActionsStorage'

type OpenSidePanelWithSearchParams = {
  open(props: SearchActionStorage): void
}

/**
 * @public
 */
const { sendMessage, onMessage } =
  defineExtensionMessaging<OpenSidePanelWithSearchParams>()

export {
  onMessage as onOpenSidePanelWithSearch,
  sendMessage as openSidePanelWithSearch,
}
