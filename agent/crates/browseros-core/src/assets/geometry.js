/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

// biome-ignore-all lint: Injected helper is passed to Runtime.callFunctionOn.
// biome-ignore format: Keep injected functionDeclaration compact.
function browserosGeometryBounds(){var r=this.getBoundingClientRect();return{x:r.left,y:r.top,w:r.width,h:r.height}}
