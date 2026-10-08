/**
 * @license
 * Copyright 2026 Redrob
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Where Redrob Code lives when `redrob` is not on the PATH this server inherited.
 *
 * The Windows installer puts the engine in %LOCALAPPDATA%\Redrob\bin and adds that to the user's Path, but a
 * browser that was already running keeps the Path it started with, so `redrob acp` failed with cmd.exe's
 * "'redrob' is not recognized" until the next sign-in. The browser's own engine installer uses ~/.redrob/bin,
 * which no Path ever names. Both are checked, in that order, and only when PATH does not already resolve
 * `redrob` -- a user who put a build of their own on PATH keeps getting it.
 */

import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join, win32 } from 'node:path'

const ENGINE = 'redrob'

/** The install locations, most specific first. */
export function redrobEngineCandidates(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): string[] {
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA ?? env.LocalAppData
    const home = env.USERPROFILE ?? homedir()
    return [
      ...(local ? [win32.join(local, 'Redrob', 'bin', 'redrob.exe')] : []),
      win32.join(home, '.redrob', 'bin', 'redrob.exe'),
    ]
  }
  return [join(env.HOME ?? homedir(), '.redrob', 'bin', ENGINE)]
}

function onPath(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  exists: (p: string) => boolean,
): boolean {
  const key =
    platform === 'win32'
      ? (Object.keys(env).find((name) => name.toLowerCase() === 'path') ??
        'Path')
      : 'PATH'
  const dirs = (env[key] ?? '')
    .split(platform === 'win32' ? ';' : delimiter)
    .filter(Boolean)
  const names =
    platform === 'win32' ? ['redrob.exe', 'redrob.cmd', 'redrob.bat'] : [ENGINE]
  const joiner = platform === 'win32' ? win32.join : join
  return dirs.some((dir) => names.some((name) => exists(joiner(dir, name))))
}

/**
 * `redrob` as a full path when PATH cannot find it but an install exists; the argument unchanged otherwise,
 * including for every command that is not the bare engine name.
 */
export function resolveRedrobEngine(
  command: string,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  exists: (p: string) => boolean = existsSync,
): string {
  if (command !== ENGINE) return command
  if (onPath(platform, env, exists)) return command
  return (
    redrobEngineCandidates(platform, env).find((candidate) =>
      exists(candidate),
    ) ?? command
  )
}

/**
 * Whether a child's stderr says its program was not found. cmd.exe reports it as "is not recognized"
 * and exits 1, and a POSIX shell or `env` says "not found" -- so the probe sees an agent that "crashed"
 * before initialize when the truth is that it was never there.
 */
export function stderrSaysCommandNotFound(stderr: string | undefined): boolean {
  if (!stderr) return false
  return /is not recognized as an internal or external command|command not found|: not found|No such file or directory|ENOENT/i.test(
    stderr,
  )
}
