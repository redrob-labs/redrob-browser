/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

#!/usr/bin/env bun

import { runCompiledResourceBuild } from '@browseros/build-server-tools'

import { compileClawServerBinaries } from './claw-server-rust/compiler'
import { clawServerRustBuildProduct } from './claw-server-rust/descriptor'

runCompiledResourceBuild(
  clawServerRustBuildProduct,
  compileClawServerBinaries,
  process.argv.slice(2),
).catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`\n✗ ${message}\n`)
  process.exit(1)
})
