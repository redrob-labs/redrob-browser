/**
 * @license
 * Copyright 2026 Redrob and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { formatRelative, t } from '@browseros/i18n'
import { type FC, useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  SettingsGroup,
  SettingsHeader,
  SettingsRow,
} from '@/components/settings/SettingsLayout'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  deleteMemoryFile,
  forgetAllMemory,
  type MemoryRun,
  type MemoryRunKind,
  type MemorySettings,
  memoryApi,
  readMemoryFile,
  readMemorySettings,
  revertMemoryRun,
  runMemoryConsolidation,
  setMemoryEnabled,
  setMemoryHistoryInput,
  setMemoryRetentionDays,
  writeMemoryFile,
} from '@/lib/memory/memory-api'

const RETENTION = [
  { days: 30, label: 'mem30Days' },
  { days: 90, label: 'mem90Days' },
  { days: 0, label: 'memForever' },
] as const

const KIND_LABEL: Record<MemoryRunKind, Parameters<typeof t>[0]> = {
  extract: 'memKindExtract',
  consolidate: 'memKindConsolidate',
  user: 'memKindUser',
  revert: 'memKindRevert',
}

/** One file open in the editor: what was loaded, and what is in the textarea now. */
type Open = { path: string; loaded: string; draft: string }

const RunRow: FC<{
  run: MemoryRun
  busy: boolean
  onRevert: (run: MemoryRun) => void
}> = ({ run, busy, onRevert }) => {
  const meta = [
    formatRelative(run.startedMs),
    run.finished
      ? t('memSeconds', Math.max(1, Math.round(run.durationMs / 1000)))
      : t('memRunning'),
    run.tokens > 0 ? t('memTokens', run.tokens) : null,
  ].filter(Boolean)
  return (
    <div className="ui-settings-row">
      <div className="min-w-0 flex-1">
        <span className="ui-settings-row__label">{t(KIND_LABEL[run.kind])}</span>
        <p className="ui-settings-row__desc">{meta.join(' · ')}</p>
        {run.files.length === 0 ? (
          <p className="ui-settings-row__desc">{t('memNoChanges')}</p>
        ) : (
          <ul className="ui-settings-row__desc">
            {run.files.map((file) => (
              <li key={file.path}>
                <code>{file.path}</code> +{file.added} −{file.removed}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="shrink-0">
        {run.revertible && run.finished && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onRevert(run)}
          >
            {t('memRevert')}
          </Button>
        )}
      </div>
    </div>
  )
}

export const MemorySettingsPage: FC = () => {
  const [settings, setSettings] = useState<MemorySettings | null>(null)
  const [open, setOpen] = useState<Open | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmForget, setConfirmForget] = useState(false)
  const available = memoryApi() !== null

  const reload = useCallback(async () => {
    if (!memoryApi()) return
    setSettings(await readMemorySettings())
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const guarded = async (action: () => Promise<void> | void) => {
    setBusy(true)
    try {
      await action()
    } catch {
      toast.error(t('memUpdateFailed'))
    } finally {
      setBusy(false)
      await reload()
    }
  }

  const openFile = (path: string) =>
    guarded(async () => {
      const content = await readMemoryFile(path)
      if (content === undefined) {
        toast.error(t('memLoadFailed'))
        return
      }
      setOpen({ path, loaded: content, draft: content })
    })

  const saveFile = () =>
    guarded(async () => {
      if (!open) return
      if (await writeMemoryFile(open.path, open.draft)) {
        setOpen({ ...open, loaded: open.draft })
        toast.success(t('memSaved'))
      } else {
        toast.error(t('memSaveFailed'))
      }
    })

  const deleteFile = (path: string) =>
    guarded(async () => {
      if (await deleteMemoryFile(path)) {
        if (open?.path === path) setOpen(null)
        toast.success(t('memDeleted'))
      } else {
        toast.error(t('memUpdateFailed'))
      }
    })

  const revert = (run: MemoryRun) =>
    guarded(async () => {
      if (await revertMemoryRun(run.id)) {
        // The open file may be one the revert changed; reading it again beats showing a stale draft.
        setOpen(null)
        toast.success(t('memReverted'))
      } else {
        toast.error(t('memRevertFailed'))
      }
    })

  const consolidate = () =>
    guarded(async () => {
      if (await runMemoryConsolidation()) {
        toast.success(t('memConsolidateStarted'))
      } else {
        toast.error(t('memConsolidateFailed'))
      }
    })

  if (!available) {
    return (
      <div className="space-y-8">
        <SettingsHeader title={t('memTitle')} lede={t('memUnavailable')} />
      </div>
    )
  }

  return (
    <div className="fade-in slide-in-from-bottom-5 animate-in space-y-8 duration-500">
      <SettingsHeader
        title={t('memTitle')}
        lede={t('memLede')}
        actions={
          <Button
            variant="outline"
            disabled={busy || !settings?.enabled}
            onClick={consolidate}
          >
            {t('memConsolidateNow')}
          </Button>
        }
      />

      <SettingsGroup title={t('memGroupGeneral')}>
        <SettingsRow
          htmlFor="memory-enabled"
          label={t('memEnabled')}
          description={t('memEnabledHint')}
        >
          <Switch
            id="memory-enabled"
            checked={settings?.enabled ?? false}
            disabled={!settings || busy}
            onCheckedChange={(checked) =>
              guarded(() => setMemoryEnabled(checked))
            }
          />
        </SettingsRow>
        <SettingsRow
          labelId="memory-retention"
          label={t('memRetention')}
          description={t('memRetentionHint')}
        >
          <Select
            value={String(settings?.retentionDays ?? 90)}
            disabled={!settings || busy}
            onValueChange={(value) =>
              guarded(() => setMemoryRetentionDays(Number(value)))
            }
          >
            <SelectTrigger aria-labelledby="memory-retention">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RETENTION.map(({ days, label }) => (
                <SelectItem key={days} value={String(days)}>
                  {t(label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
        <SettingsRow
          htmlFor="memory-history"
          label={t('memHistory')}
          description={t('memHistoryHint')}
        >
          <Switch
            id="memory-history"
            checked={settings?.historyInput ?? false}
            disabled={!settings || busy}
            onCheckedChange={(checked) =>
              guarded(() => setMemoryHistoryInput(checked))
            }
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title={t('memGroupFiles')}>
        {!settings || settings.files.length === 0 ? (
          <div className="ui-settings-row">
            <p className="ui-settings-row__desc">{t('memFilesEmpty')}</p>
          </div>
        ) : (
          settings.files.map((file) => (
            <div key={file.path} className="ui-settings-row">
              <div className="min-w-0 flex-1">
                <code className="ui-settings-row__label">{file.path}</code>
                <p className="ui-settings-row__desc">
                  {t('memBytes', file.bytes)} ·{' '}
                  {formatRelative(file.modifiedMs)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => openFile(file.path)}
                >
                  {t('memOpen')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => deleteFile(file.path)}
                >
                  {t('memDelete')}
                </Button>
              </div>
            </div>
          ))
        )}
        {open && (
          <div className="ui-settings-row flex-col items-stretch gap-2">
            <code className="ui-settings-row__label">{open.path}</code>
            <Textarea
              aria-label={t('memEditorLabel', open.path)}
              className="min-h-64 font-mono"
              value={open.draft}
              onChange={(event) =>
                setOpen({ ...open, draft: event.target.value })
              }
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(null)}>
                {t('memClose')}
              </Button>
              <Button
                disabled={busy || open.draft === open.loaded}
                onClick={saveFile}
              >
                {t('memSave')}
              </Button>
            </div>
          </div>
        )}
      </SettingsGroup>

      <SettingsGroup title={t('memGroupRuns')}>
        {!settings || settings.runs.length === 0 ? (
          <div className="ui-settings-row">
            <p className="ui-settings-row__desc">{t('memRunsEmpty')}</p>
          </div>
        ) : (
          settings.runs.map((run) => (
            <RunRow key={run.id} run={run} busy={busy} onRevert={revert} />
          ))
        )}
      </SettingsGroup>

      <div>
        <Button
          variant="destructive"
          disabled={busy}
          onClick={() => setConfirmForget(true)}
        >
          {t('memForget')}
        </Button>
      </div>

      <AlertDialog open={confirmForget} onOpenChange={setConfirmForget}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('memForget')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('memForgetConfirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('spCancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                guarded(() => {
                  forgetAllMemory()
                  setOpen(null)
                  toast.success(t('memForgotten'))
                })
              }
            >
              {t('memForget')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
