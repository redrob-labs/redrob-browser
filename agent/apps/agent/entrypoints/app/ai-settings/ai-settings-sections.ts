/**
 * AI Settings is a master-detail page. The active detail pane is driven by the
 * `?section=` search param so deep links (e.g. `/settings/ai?section=claude`)
 * open straight onto an adapter. `browseros` is the LLM-providers pane; any
 * other value must match a currently-visible harness adapter id, otherwise we
 * fall back to `browseros` (covers missing param, hidden Hermes, stale links,
 * and the brief window before adapters load).
 */
export const BROWSEROS_SECTION = 'browseros'

export type AiSettingsSection = string

export function resolveAiSettingsSection(
  raw: string | null | undefined,
  visibleAdapterIds: readonly string[],
): AiSettingsSection {
  if (raw && raw !== BROWSEROS_SECTION && visibleAdapterIds.includes(raw)) {
    return raw
  }
  return BROWSEROS_SECTION
}
