/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported unchanged in substance from redrob-cowork apps/server/src/team-policy/keys.ts: the browser and
 * Cowork verify the same signed file, and the shared vectors (tests/lib/privacy/fixtures/team-policy)
 * are the contract between them and the console.
 */

/*
 * The public keys a team policy may be signed with. Pinned in the build, never fetched: a key list
 * the app downloads would be a second way to get a key trusted, and the one an attacker would aim
 * at. Rotation is two keys deep instead. The console signs with the active key; to rotate it
 * starts signing with the standby key, and the next release pins a new standby.
 *
 * PRODUCTION_KEYS is empty until the console's KMS keys exist (redrob-console K4),
 * so until then a packaged build accepts no policy at all. TEST_KEYS are accepted only in a
 * development build (REDROB_DEV_MODE=1) or when a test asks for them; their private halves are in
 * tests/lib/privacy/fixtures/team-policy/test-keys.json, so anyone can sign with them, which is exactly why a packaged build
 * must never trust them.
 */

export type PinnedKey = {
  kid: string
  jwk: { kty: 'EC'; crv: 'P-256'; x: string; y: string }
}

const TEST_KEY_PREFIX = 'test-'

export const PRODUCTION_KEYS: readonly PinnedKey[] = []

export const TEST_KEYS: readonly PinnedKey[] = [
  {
    kid: 'test-2026-10-active',
    jwk: {
      kty: 'EC',
      crv: 'P-256',
      x: 'sJ_MU3gdtP-MyQNDq5olOvKQu7x9DnnACnr2EaYHxP0',
      y: 'IzLhCEa0vmJE4srb1YYNYEBR_DfkbNOu8UFAzPdSDNE',
    },
  },
  {
    kid: 'test-2026-10-standby',
    jwk: {
      kty: 'EC',
      crv: 'P-256',
      x: 'PCFJ6QeewCQ63huKOmCMOvX-rFrJYEhD83a85-VumAI',
      y: 'AZnvYBiBi5-ihCjtQQTmUhN5m5npm2W0ayI181X-tUc',
    },
  },
]

/** Test keys only where a test key cannot hurt anyone: a dev build, or a test that opts in. */
function testKeysAllowed(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.REDROB_DEV_MODE === '1' || env.REDROB_TEAM_POLICY_TEST_KEYS === '1'
}

export function trustedKeys(
  env: Record<string, string | undefined> = process.env,
): readonly PinnedKey[] {
  // A production kid can never be shadowed by a test one: test kids carry the prefix, production
  // kids must not, and a key list that breaks that rule is refused outright.
  for (const key of PRODUCTION_KEYS) {
    if (key.kid.startsWith(TEST_KEY_PREFIX))
      throw new Error(`Production key ${key.kid} uses the test prefix`)
  }
  return testKeysAllowed(env)
    ? [...PRODUCTION_KEYS, ...TEST_KEYS]
    : PRODUCTION_KEYS
}
