/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * SHA-256 of every file the compiled server may open natively, by `${platform}-${arch}`.
 *
 * Empty in source. The server build replaces this module with the hashes of the onnxruntime-node
 * files it ships (packages/build-server-tools/src/onnxruntime.ts), so the pins are fixed when the
 * binary is built, not read from the files beside it.
 */

export const ORT_PINS: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {}
