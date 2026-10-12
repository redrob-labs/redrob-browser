/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { useCallback, useEffect, useState } from 'react'
import type { DiagnosticsResult } from './collector'
import { diagnosticSections, formatDiagnostics } from './contract'
import { requestDiagnostics } from './extension'
import './styles.css'

/** The same snapshot powers the visible rows and clipboard across both products. */
/**
 * `tr` translates the page's own English copy, key for key; the host app passes its localisation.
 * The copied text (formatDiagnostics) stays English on purpose: it goes to support, who read one language.
 * Machine values -- versions, processor names, sizes -- are never passed through it.
 */
export function DiagnosticsPage({
  tr = (english: string) => english,
}: {
  tr?: (english: string) => string
} = {}) {
  const [result, setResult] = useState<DiagnosticsResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [copyFallback, setCopyFallback] = useState(false)
  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    setCopied(false)
    setCopyFallback(false)
    try {
      setResult(await requestDiagnostics())
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : tr('Diagnostics unavailable'),
      )
    } finally {
      setLoading(false)
    }
  }, [tr])
  useEffect(() => {
    void refresh()
  }, [refresh])
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = () => {
    if (!result) return
    // Keep the clipboard write in the user's gesture; collection happens separately.
    try {
      void navigator.clipboard
        .writeText(formatDiagnostics(result.snapshot))
        .then(() => {
          setCopied(true)
          setCopyFallback(false)
        })
        .catch(() => setCopyFallback(true))
    } catch {
      setCopyFallback(true)
    }
  }

  return (
    <section
      className="browseros-diagnostics ph-no-capture"
      aria-labelledby="diagnostics-title"
    >
      <p className="diagnostics-breadcrumb">
        {tr('Help')} <span>/</span> {tr('Diagnostics')}
      </p>
      <div className="diagnostics-header">
        <div>
          <h1 id="diagnostics-title">{tr('Diagnostics')}</h1>
          <p>{tr('Version and system details to help us troubleshoot.')}</p>
        </div>
        <div className="diagnostics-actions">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <span aria-hidden="true">↻</span>{' '}
            {loading ? tr('Refreshing…') : tr('Refresh')}
          </button>
          <button
            type="button"
            className="diagnostics-copy"
            onClick={copy}
            disabled={!result || loading}
          >
            {copied ? tr('Copied') : tr('Copy diagnostics')}
          </button>
        </div>
      </div>
      <p className="diagnostics-timestamp" role="status">
        {result
          ? `${result.cached ? tr('Cached sample') : tr('Collected')} · ${new Date(result.snapshot.collectedAt).toLocaleString()}`
          : loading
            ? tr('Collecting diagnostics…')
            : tr('No sample available')}
      </p>
      {error && (
        <p role="alert">
          {error}
          {result ? ` ${tr('Showing the previous sample.')}` : ''}
        </p>
      )}
      {result &&
        diagnosticSections(result.snapshot).map((section) => (
          <section
            className="diagnostics-section"
            key={section.title}
            aria-label={tr(section.title)}
          >
            <div className="diagnostics-section-heading">
              <h2>{tr(section.title)}</h2>
              {section.title === 'Memory' && (
                <span>{tr('At time of collection')}</span>
              )}
            </div>
            <dl>
              {section.rows.map(([label, value]) => (
                <div className="diagnostics-row" key={label}>
                  <dt>{label == null ? null : tr(label)}</dt>
                  {/* A reported value is the machine's own data, not copy; only the fallback is ours. */}
                  <dd
                    translate={
                      value == null || value === 'Unavailable'
                        ? undefined
                        : 'no'
                    }
                  >
                    {value == null || value === 'Unavailable'
                      ? tr('Unavailable')
                      : value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      {result && (
        <p className="diagnostics-note">
          {tr(
            'Copy includes these details and the collection time. No browsing history or account information.',
          )}
        </p>
      )}
      {copyFallback && result && (
        <label className="diagnostics-fallback">
          {tr('Clipboard unavailable. Select and copy these details:')}
          <textarea
            readOnly
            value={formatDiagnostics(result.snapshot)}
            onFocus={(event) => event.currentTarget.select()}
            rows={16}
          />
        </label>
      )}
    </section>
  )
}
