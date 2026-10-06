/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import type { AssetBuildProductDescriptor } from '@browseros/build-server-tools'

const INLINED_ENV_VARS = ['NODE_ENV'] as const
const PRODUCTION_INLINE_ENV = {
  NODE_ENV: 'production',
}

// build:chromium runs tsc, vite --mode chromium, and the WebUI contract
// verification, so the staged dist is always contract-checked before upload.
export const appOnboardBuildProduct: AssetBuildProductDescriptor = {
  label: 'BrowserOS onboarding',
  packageDir: 'apps/app-onboard',
  buildCommand: ['bun', 'run', 'build:chromium'],
  assetsDir: 'apps/app-onboard/dist/chromium',
  distRoot: 'dist/prod/app-onboard',
  archiveBaseName: 'browseros-app-onboard-resources',
  env: {
    requiredInlineEnvKeys: [],
    inlineEnvKeys: INLINED_ENV_VARS,
    ciInlineEnvDefaults: PRODUCTION_INLINE_ENV,
    inlineEnvOverrides: PRODUCTION_INLINE_ENV,
    defaultR2UploadPrefix: 'app-onboard/prod-resources',
  },
}
