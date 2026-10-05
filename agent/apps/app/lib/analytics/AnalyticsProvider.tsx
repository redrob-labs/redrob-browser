/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { PostHogProvider as Provider } from '@posthog/react'
import type { FC, PropsWithChildren } from 'react'
import { posthog } from './posthog'

/**
 * @public
 */
export const AnalyticsProvider: FC<PropsWithChildren> = ({ children }) => {
  return <Provider client={posthog}>{children}</Provider>
}
