import { describe, expect, it } from 'bun:test'

import { ARCHES, parseArch } from '../src/schema/arch'

describe('schema/arch', () => {
  it('exports the supported arches', () => {
    expect(ARCHES).toEqual(['amd64', 'arm64'])
  })

  it('parses valid arches', () => {
    expect(parseArch('amd64')).toBe('amd64')
    expect(parseArch('arm64')).toBe('arm64')
  })

  it('rejects invalid arches', () => {
    expect(() => parseArch('x64')).toThrow('invalid container arch')
  })
})
