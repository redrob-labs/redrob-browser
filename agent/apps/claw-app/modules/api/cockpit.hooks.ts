/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import type { CockpitStats } from '@browseros/claw-api'
import { createQuery } from 'react-query-kit'
import { apiClient } from './client'

// Polling is opt-in at the call site (Cockpit.tsx): the final projection runs
// after live teardown, so an already-mounted idle Cockpit observes the
// aggregate as soon as it lands.
export const useCockpitStats = createQuery<CockpitStats>({
  queryKey: ['api', 'cockpit', 'stats'],
  fetcher: async () => (await apiClient()).getCockpitStats(),
})
