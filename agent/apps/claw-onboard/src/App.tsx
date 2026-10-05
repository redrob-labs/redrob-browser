/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { Route, Routes } from 'react-router'
import { OnboardingV2 } from '@/onboarding/OnboardingV2'

export function App() {
  return (
    <Routes>
      <Route path="*" element={<OnboardingV2 />} />
    </Routes>
  )
}
