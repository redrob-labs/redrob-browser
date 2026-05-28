import { describe, expect, it } from 'bun:test'
import { resolveAiSettingsSection } from './ai-settings-sections'

describe('resolveAiSettingsSection', () => {
  const visible = ['claude', 'codex']

  it('returns the adapter section when it is a visible adapter', () => {
    expect(resolveAiSettingsSection('claude', visible)).toBe('claude')
    expect(resolveAiSettingsSection('codex', visible)).toBe('codex')
  })

  it('falls back to browseros when the param is missing', () => {
    expect(resolveAiSettingsSection(null, visible)).toBe('browseros')
    expect(resolveAiSettingsSection(undefined, visible)).toBe('browseros')
    expect(resolveAiSettingsSection('browseros', visible)).toBe('browseros')
  })

  it('falls back to browseros for hidden or unknown sections', () => {
    expect(resolveAiSettingsSection('hermes', visible)).toBe('browseros')
    expect(resolveAiSettingsSection('bogus', visible)).toBe('browseros')
  })

  it('falls back to browseros before adapters load', () => {
    expect(resolveAiSettingsSection('claude', [])).toBe('browseros')
  })
})
