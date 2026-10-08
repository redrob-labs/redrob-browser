/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

const REGISTRATION_LOG_SAMPLE_RATE = 10
let registrationLogEvents = 0

/** Samples noisy tool-registration info logs while keeping a startup breadcrumb. */
export function shouldLogToolRegistration(): boolean {
  registrationLogEvents += 1
  return (registrationLogEvents - 1) % REGISTRATION_LOG_SAMPLE_RATE === 0
}

export function resetToolRegistrationLogSamplingForTests(): void {
  registrationLogEvents = 0
}
