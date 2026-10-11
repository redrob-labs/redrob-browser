/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported unchanged in substance from redrob-cowork apps/server/src/team-policy/jws.ts: the browser and
 * Cowork verify the same signed file, and the shared vectors (tests/lib/privacy/fixtures/team-policy)
 * are the contract between them and the console.
 */

import type { PinnedKey } from './keys'
import { type TeamPolicy, teamPolicySchema } from './policy'

/** Why a policy was refused, by a code the status and the audit trail can name. */
export class TeamPolicyError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'TeamPolicyError'
  }
}

/*
 * Compact JWS verification for team policies, with WebCrypto and nothing else. The format is
 * deliberately narrow: ES256 only, a `kid` the build pins, and the `typ` the console sets. Every
 * other algorithm, `none` included, is refused before any key is touched, so there is no header
 * an attacker can write that changes how the signature is checked.
 */

export const TEAM_POLICY_JWS_TYPE = 'redrob-team-policy+jws'

/** Far more than any real policy (a few KB), and small enough that parsing it costs nothing. */
const MAX_POLICY_JWS_LENGTH = 1_000_000

export type VerifiedTeamPolicy = {
  policy: TeamPolicy
  kid: string
  payloadSha256: string
}

const BASE64URL = /^[A-Za-z0-9_-]*$/

function refuse(code: string, message: string): never {
  throw new TeamPolicyError(code, message)
}

function decodeBase64Url(part: string, what: string): Uint8Array<ArrayBuffer> {
  if (!BASE64URL.test(part))
    refuse('team_policy_malformed', `The policy's ${what} is not base64url`)
  return new Uint8Array(Buffer.from(part, 'base64url'))
}

function parseJson(bytes: Uint8Array, what: string): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    return refuse('team_policy_malformed', `The policy's ${what} is not JSON`)
  }
}

const keyCache = new Map<string, Promise<CryptoKey>>()

function importKey(key: PinnedKey): Promise<CryptoKey> {
  const cacheKey = `${key.kid}:${key.jwk.x}:${key.jwk.y}`
  let cached = keyCache.get(cacheKey)
  if (!cached) {
    cached = crypto.subtle.importKey(
      'jwk',
      { ...key.jwk, ext: true },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    )
    keyCache.set(cacheKey, cached)
  }
  return cached
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString(
    'hex',
  )
}

/**
 * Verifies a compact JWS and returns its policy. Throws TeamPolicyError with a specific code for every
 * refusal, so a caller (and the audit log) can say why a policy was not applied.
 */
export async function verifyTeamPolicyJws(
  token: string,
  keys: readonly PinnedKey[],
): Promise<VerifiedTeamPolicy> {
  if (typeof token !== 'string' || token.length === 0)
    refuse('team_policy_malformed', 'No policy was given')
  if (token.length > MAX_POLICY_JWS_LENGTH)
    refuse('team_policy_malformed', 'The policy is too large')

  const parts = token.split('.')
  if (parts.length !== 3)
    refuse('team_policy_malformed', 'The policy is not a compact JWS')
  const [headerPart, payloadPart, signaturePart] = parts as [
    string,
    string,
    string,
  ]

  const header = parseJson(decodeBase64Url(headerPart, 'header'), 'header')
  if (typeof header !== 'object' || header === null || Array.isArray(header)) {
    refuse('team_policy_malformed', "The policy's header is not an object")
  }
  const { alg, kid, typ, crit } = header as Record<string, unknown>
  if (alg !== 'ES256')
    refuse('team_policy_bad_algorithm', 'The policy must be signed with ES256')
  if (typ !== TEAM_POLICY_JWS_TYPE)
    refuse('team_policy_malformed', 'The policy has the wrong type')
  // A critical extension this verifier does not implement must fail closed (RFC 7515 4.1.11).
  if (crit !== undefined)
    refuse(
      'team_policy_malformed',
      'The policy names extensions this app does not support',
    )
  if (typeof kid !== 'string' || !kid)
    refuse(
      'team_policy_unknown_key',
      'The policy does not name its signing key',
    )

  const key = keys.find((candidate) => candidate.kid === kid)
  if (!key)
    refuse(
      'team_policy_unknown_key',
      `The policy was signed with a key this app does not trust (${kid})`,
    )

  // ES256 in JWS is the raw 64-byte r||s, which is also what WebCrypto's ECDSA verify expects.
  const signature = decodeBase64Url(signaturePart, 'signature')
  if (signature.length !== 64)
    refuse('team_policy_bad_signature', "The policy's signature is not valid")

  const signingInput = new TextEncoder().encode(`${headerPart}.${payloadPart}`)
  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    await importKey(key),
    signature,
    signingInput,
  )
  if (!valid)
    refuse('team_policy_bad_signature', "The policy's signature is not valid")

  // Only now, with the signature checked, is the payload read at all.
  const payloadBytes = decodeBase64Url(payloadPart, 'payload')
  const parsed = teamPolicySchema.safeParse(parseJson(payloadBytes, 'payload'))
  if (!parsed.success) {
    refuse(
      'team_policy_invalid',
      `The policy is signed but not valid: ${parsed.error.issues[0]?.message ?? 'invalid'}`,
    )
  }
  return {
    policy: parsed.data,
    kid: key.kid,
    payloadSha256: await sha256Hex(payloadBytes),
  }
}
