/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import type { ToolSet } from 'ai'
import { createBashTool } from './bash'
import { createEditTool } from './edit'
import { createFindTool } from './find'
import { createGrepTool } from './grep'
import { createLsTool } from './ls'
import { createReadTool, type ReadToolOptions } from './read'
import { createWriteTool } from './write'

export interface FilesystemToolSetOptions {
  read?: ReadToolOptions
}

export function buildFilesystemToolSet(
  cwd: string,
  options: FilesystemToolSetOptions = {},
): ToolSet {
  return {
    filesystem_read: createReadTool(cwd, options.read),
    filesystem_write: createWriteTool(cwd),
    filesystem_edit: createEditTool(cwd),
    filesystem_bash: createBashTool(cwd),
    filesystem_grep: createGrepTool(cwd),
    filesystem_find: createFindTool(cwd),
    filesystem_ls: createLsTool(cwd),
  }
}
