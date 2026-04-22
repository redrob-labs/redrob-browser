import { describe, expect, it } from 'bun:test'

import {
  keyForAggregateManifest,
  keyForSha,
  keyForTarball,
  keyForVersionManifest,
} from '../src/schema/r2-keys'

describe('schema/r2-keys', () => {
  it('builds tarball keys', () => {
    expect(keyForTarball('openclaw', '2026.4.12', 'amd64')).toBe(
      'agents/openclaw/2026.4.12/openclaw-2026.4.12-amd64.tar.gz',
    )
  })

  it('supports a custom publishAs filename prefix', () => {
    expect(keyForTarball('claude-code', '1.2.3', 'arm64', 'claude')).toBe(
      'agents/claude-code/1.2.3/claude-1.2.3-arm64.tar.gz',
    )
    expect(keyForSha('claude-code', '1.2.3', 'arm64', 'claude')).toBe(
      'agents/claude-code/1.2.3/claude-1.2.3-arm64.tar.gz.sha256',
    )
  })

  it('builds manifest keys', () => {
    expect(keyForVersionManifest('openclaw', '2026.4.12')).toBe(
      'agents/openclaw/2026.4.12/manifest.json',
    )
    expect(keyForAggregateManifest()).toBe('agents/manifest.json')
  })
})
