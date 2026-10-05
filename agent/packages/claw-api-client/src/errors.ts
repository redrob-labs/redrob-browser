/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

export class ApiResponseError extends Error {
  override name = 'ApiResponseError'

  constructor(public readonly response: Response) {
    super(
      `BrowserOS neo API request failed with status ${response.status.toString()}`,
    )
  }
}
