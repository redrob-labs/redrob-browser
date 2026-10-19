/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { t, tNodes } from '@browseros/i18n'
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  Download,
  ExternalLink,
  KeyRound,
  Lock,
  RefreshCw,
} from '@browseros/icons'
import { useId, useRef, useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { FormField, FormItem, FormMessage } from '@/components/ui/form'
import type {
  BrowserOSImportItem,
  BrowserOSImportSource,
  BrowserOSOnboardingState,
} from '../browseros-onboarding-api'
import { DisplayHeading, Em, StepCopy } from '../components/DisplayHeading'
import { ImportedSummaryCard } from '../components/ImportedSummaryCard'
import { ImportItemChecklist } from '../components/ImportItemChecklist'
import { ImportingProgressCard } from '../components/ImportingProgressCard'
import { ImportSourceTile } from '../components/ImportSourceTile'
import { MacKeychainDialog } from '../components/MacKeychainDialog'
import { MacKeychainReminder } from '../components/MacKeychainNotice'
import { StepWrap } from '../components/StepWrap'
import {
  completedImportItemCount,
  defaultImportItemsForSource,
  importItemLabel,
  importItemListLabel,
  importProgressTotal,
  isMacOS,
  needsMacKeychainPermission,
  sanitizeImportSelection,
  selectedSourceById,
} from '../onboarding-v2.helpers'
import type { OnboardingFormValues } from '../onboarding-v2.schemas'
import type { ImportPhase } from '../onboarding-v2.types'

interface ImportStepProps {
  phase: ImportPhase
  state: BrowserOSOnboardingState
  form: UseFormReturn<OnboardingFormValues>
  onImport: () => void
  onRefresh: () => void
  onContinue: () => void
  /** Stops a running import. */
  onCancel?: () => void
  /** Opens the password manager for the CSV route. */
  onOpenPasswordManager?: () => void
}

/** Sources whose saved passwords are not copied: say how to bring them anyway. */
function PasswordsViaCsvNotice({
  browserName,
  onOpenPasswordManager,
}: {
  browserName: string
  onOpenPasswordManager?: () => void
}) {
  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-border-2 bg-card p-4">
      <KeyRound aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-2" />
      <div className="flex-1">
        <div className="mb-1 font-bold text-[13px] text-ink">
          {t('onboardPasswordsViaCsvTitle')}
        </div>
        <p className="mb-2.5 text-[12.5px] text-ink-2">
          {t('onboardPasswordsViaCsvBody', browserName)}
        </p>
        {onOpenPasswordManager && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onOpenPasswordManager}
          >
            <ExternalLink aria-hidden className="size-3.5" />
            {t('onboardOpenPasswordManager')}
          </Button>
        )}
      </div>
    </div>
  )
}

function importButtonLabelFor(
  hasSource: boolean,
  hasSupportedItems: boolean,
  checkedItems: readonly BrowserOSImportItem[],
  browserName: string,
): string {
  if (!hasSource) return t('onboardPickAProfileAction')
  if (!hasSupportedItems) return t('onboardNothingToCopy')
  if (checkedItems.length === 0) return t('onboardSelectWhatToCopy')

  return t('onboardCopyFrom', browserName.replace(/^Google /, ''))
}

/** Collapsing the list must not hide the profile whose data will be copied. */
function visibleProfiles(
  sources: readonly BrowserOSImportSource[],
  selectedSource: BrowserOSImportSource | undefined,
  expanded: boolean,
) {
  if (expanded) return sources
  const visible = sources.slice(0, 4)
  if (selectedSource && !visible.includes(selectedSource))
    visible[3] = selectedSource
  return visible
}

export function ImportStep({
  phase,
  state,
  form,
  onImport,
  onRefresh,
  onContinue,
  onCancel,
  onOpenPasswordManager,
}: ImportStepProps) {
  const [permissionOpen, setPermissionOpen] = useState(false)
  const [showAllProfiles, setShowAllProfiles] = useState(false)
  const importButtonRef = useRef<HTMLButtonElement>(null)
  const profileListId = useId()
  const selectedSourceId = form.watch('selectedSourceId')
  const selectedSource = selectedSourceById(state.sources, selectedSourceId)
  const sourceResult = state.results?.[0]
  const checkedItems = selectedSource
    ? sanitizeImportSelection(selectedSource, form.watch('selectedItems'))
    : []
  const needsPermission = needsMacKeychainPermission(
    isMacOS(),
    selectedSource,
    checkedItems,
  )
  const visibleSources = visibleProfiles(
    state.sources,
    selectedSource,
    showAllProfiles,
  )
  const sourceName =
    sourceResult?.displayName ||
    selectedSource?.profileName ||
    selectedSource?.browserName ||
    'source'
  const isDetecting = state.status === 'detecting'
  const hasNoProfiles = !isDetecting && state.sources.length === 0
  const hasSupportedItems = (selectedSource?.supportedItems.length ?? 0) > 0
  const isPickerValid =
    Boolean(selectedSource) &&
    hasSupportedItems &&
    checkedItems.length > 0 &&
    !isDetecting
  const completedItems = completedImportItemCount(state.progress)
  const totalItems = selectedSource
    ? importProgressTotal(checkedItems.length, state.progress)
    : (state.progress?.totalItems ?? 0)
  const currentItemLabel = state.progress?.currentItem
    ? importItemLabel(state.progress.currentItem)
    : undefined
  const currentSourceLabel = state.progress?.currentSourceName
  const importedItems = state.progress?.completedItems ?? []
  const importedItemSummary = state.progress
    ? importedItems.length
      ? importItemListLabel(importedItems)
      : 'No completed items reported'
    : 'No item details reported'
  const importButtonLabel = importButtonLabelFor(
    Boolean(selectedSource),
    hasSupportedItems,
    checkedItems,
    selectedSource?.browserName ?? 'browser',
  )

  function requestImport() {
    if (!isPickerValid) return
    if (needsPermission) {
      setPermissionOpen(true)
      return
    }
    onImport()
  }

  function confirmImport() {
    setPermissionOpen(false)
    // Do not defer to an effect or animation: native import needs the recent
    // Continue gesture. The bridge owns the pending lock until native replies.
    if (isPickerValid && (phase === 'picker' || phase === 'failed')) onImport()
  }

  function toggleImportItem(item: BrowserOSImportItem) {
    if (!selectedSource) return
    const currentItems = sanitizeImportSelection(
      selectedSource,
      form.getValues('selectedItems'),
    )
    const nextItems = currentItems.includes(item)
      ? currentItems.filter((currentItem) => currentItem !== item)
      : sanitizeImportSelection(selectedSource, [...currentItems, item])
    form.setValue('selectedItems', nextItems, {
      shouldDirty: true,
      shouldValidate: true,
    })
  }

  return (
    <StepWrap className="max-w-[800px]">
      <DisplayHeading>
        {tNodes(
          'onboardBringHeading',
          <Em key="em">{t('onboardBringHeadingEm')}</Em>,
        )}
      </DisplayHeading>
      <StepCopy>{t('onboardCopyYourHistoryBookmarksAnd')}</StepCopy>

      {phase === 'picker' && (
        <>
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <div className="font-bold text-[12.5px] text-ink-2">
              {isDetecting
                ? t('onboardLookingForProfiles')
                : t('onboardPickAProfileAction')}
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onRefresh}
              disabled={isDetecting}
            >
              <RefreshCw
                className={`size-3.5 ${isDetecting ? 'animate-spin' : ''}`}
              />
              {t('onboardRefresh')}
            </Button>
          </div>
          <FormField
            control={form.control}
            name="selectedSourceId"
            render={({ field }) => (
              <FormItem
                id={profileListId}
                className="mb-3 flex flex-col gap-2"
                role="radiogroup"
                aria-label={t('onboardBrowserProfiles')}
              >
                {visibleSources.map((source) => (
                  <ImportSourceTile
                    key={source.id}
                    source={source}
                    selected={field.value === source.id}
                    onSelect={() => {
                      if (field.value === source.id) return
                      field.onChange(source.id)
                      form.setValue(
                        'selectedItems',
                        defaultImportItemsForSource(source),
                        {
                          shouldDirty: true,
                          shouldValidate: true,
                        },
                      )
                    }}
                  />
                ))}
                {hasNoProfiles && (
                  <div className="rounded-xl border border-border-2 bg-card p-4 text-[12.5px] text-ink-2">
                    {t('onboardNoProfilesFound')}
                  </div>
                )}
                {/* Only ask for a pick when there is one to make. With no
                    sources the error is self-inflicted and unactionable:
                    OnboardingV2 clears selectedSourceId with shouldValidate
                    whenever the list is empty, including while detecting. */}
                {state.sources.length > 0 && <FormMessage />}
              </FormItem>
            )}
          />
          {state.sources.length > 4 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mb-4 text-ink-2"
              aria-expanded={showAllProfiles}
              aria-controls={profileListId}
              onClick={() => setShowAllProfiles(!showAllProfiles)}
            >
              <ChevronDown
                aria-hidden
                className={`size-3.5 ${showAllProfiles ? 'rotate-180' : ''}`}
              />
              {showAllProfiles
                ? t('onboardShowFewerProfiles')
                : t('onboardShowMoreProfiles', state.sources.length - 4)}
            </Button>
          )}
          {selectedSource && hasSupportedItems && (
            <ImportItemChecklist
              items={selectedSource.supportedItems}
              checkedItems={checkedItems}
              onToggle={toggleImportItem}
            />
          )}
          {selectedSource?.passwordsViaCsv && (
            <PasswordsViaCsvNotice
              browserName={selectedSource.browserName}
              onOpenPasswordManager={onOpenPasswordManager}
            />
          )}
          {state.status === 'cancelled' && (
            <div
              role="status"
              className="mb-4 rounded-xl border border-border-2 bg-card p-4 text-[12.5px] text-ink-2"
            >
              {t('onboardImportCancelled')}
            </div>
          )}
          {state.error && (
            <div className="mb-4 rounded-xl border border-amber/30 bg-amber-tint p-4 text-[12.5px] text-ink-2">
              {state.error.message}
            </div>
          )}
          <div className="sticky -bottom-6 z-10 border-border-2 border-t bg-bg-canvas py-4">
            {needsPermission && (
              <p className="mb-3 flex items-center gap-2 text-ink-3 text-xs">
                <Lock aria-hidden className="size-3.5" />
                {t('onboardMacosMayAskForYour')}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                size="lg"
                ref={importButtonRef}
                onClick={requestImport}
                disabled={!isPickerValid}
              >
                <Download className="size-4" />
                {importButtonLabel}
              </Button>
              <Button
                type="button"
                size="lg"
                variant="ghost"
                onClick={onContinue}
              >
                {t('onboardSkipForNow')}
              </Button>
              {selectedSource?.profileName && (
                <span className="text-ink-3 text-xs">
                  {t('onboardFromSProfile', selectedSource.profileName)}
                </span>
              )}
            </div>
          </div>
        </>
      )}

      {phase === 'importing' && (
        <>
          <ImportingProgressCard
            currentItemLabel={currentItemLabel}
            progress={completedItems}
            sourceLabel={currentSourceLabel}
            total={totalItems}
            items={checkedItems}
            completedItems={importedItems}
            currentItem={state.progress?.currentItem}
            onCancel={onCancel}
          />
          {needsPermission && <MacKeychainReminder />}
        </>
      )}

      {phase === 'failed' && (
        <>
          <div className="mb-4 rounded-xl border border-amber/30 bg-amber-tint p-4">
            <div className="mb-2 flex items-center gap-2 font-bold text-[13px] text-ink">
              <AlertTriangle className="size-4 text-amber" />
              {t('onboardSomethingWentWrong')}
            </div>
            <div className="text-[12.5px] text-ink-2">
              {state.error?.message ?? t('onboardImportFailedDetail')}
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Button
              type="button"
              size="lg"
              ref={importButtonRef}
              onClick={requestImport}
              disabled={!isPickerValid}
            >
              <Download className="size-4" />
              {t('onboardTryAgain')}
            </Button>
            <Button type="button" size="lg" variant="ghost" onClick={onRefresh}>
              <RefreshCw className="size-4" />
              {t('onboardRefreshProfiles')}
            </Button>
            <Button
              type="button"
              size="lg"
              variant="ghost"
              onClick={onContinue}
            >
              {t('onboardSkipForNow')}
            </Button>
          </div>
        </>
      )}

      {phase === 'imported' && (
        <>
          <ImportedSummaryCard
            importedItemCount={completedItems}
            itemSummary={importedItemSummary}
            sourceName={sourceName}
          />
          <Button type="button" size="lg" onClick={onContinue}>
            <ArrowRight className="size-4" />
            {t('onboardContinue')}
          </Button>
        </>
      )}
      <MacKeychainDialog
        open={
          permissionOpen &&
          isPickerValid &&
          (phase === 'picker' || phase === 'failed')
        }
        onOpenChange={setPermissionOpen}
        onContinue={confirmImport}
        returnFocus={importButtonRef}
      />
    </StepWrap>
  )
}
