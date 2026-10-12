/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { t } from '@browseros/i18n'
import { ChevronDown, Info, Loader2, RefreshCw } from '@browseros/icons'
import { type FC, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useProbeCustomAgent } from '@/modules/agents/acp-agent-probe.hooks'
import type { AcpAgent } from '@/modules/agents/acp-agent-types'
import {
  useCreateAcpAgent,
  useUpdateAcpAgent,
} from '@/modules/agents/agents.hooks'
import {
  buildCustomConfig,
  formatEnvLines,
  parseEnvLines,
} from './custom-agent-form.helpers'
import { PopularAcpAgentsDialog } from './PopularAcpAgentsDialog'

const AGENT_DEFAULT = '__agent_default__'

export interface CustomCodingAgentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When set, the dialog edits this agent instead of creating a new one. */
  agent?: AcpAgent | null
  /** Fires with the new agent's id after a custom agent is created (not on edit). */
  onSaved?: (agentId: string) => void
  /** Seeds a new agent's name, command and logo, e.g. for Redrob Code. */
  preset?: { name: string; command: string; icon: string } | null
}

export const CustomCodingAgentDialog: FC<CustomCodingAgentDialogProps> = ({
  open,
  onOpenChange,
  agent,
  onSaved,
  preset,
}) => {
  const createAgent = useCreateAcpAgent()
  const updateAgent = useUpdateAcpAgent()
  const probe = useProbeCustomAgent()
  const isEdit = Boolean(agent)

  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [workingDirectory, setWorkingDirectory] = useState('')
  const [envText, setEnvText] = useState('')
  const [fullAccessModesText, setFullAccessModesText] = useState('')
  const [reasoningEffortKey, setReasoningEffortKey] = useState('')
  const [systemPromptAppend, setSystemPromptAppend] = useState('')
  // Brand id (e.g. 'opencode') carried from the Popular-agents picker so the
  // saved agent shows that agent's logo. Stored in customConfig.icon.
  const [logoKey, setLogoKey] = useState('')
  const [modelId, setModelId] = useState('')
  const [reasoningEffort, setReasoningEffort] = useState('')
  const [popularOpen, setPopularOpen] = useState(false)

  // Seed the form when the dialog opens. Matches the sibling coding-agent
  // dialog; the shadcn Dialog stays mounted, so state is reset here on open.
  useEffect(() => {
    if (!open) return
    const config = agent?.customConfig
    const seed = agent ? null : preset
    setName(agent?.name ?? seed?.name ?? '')
    setCommand(config?.command ?? seed?.command ?? '')
    setWorkingDirectory(agent?.workingDirectory ?? '')
    setEnvText(formatEnvLines(config?.env))
    setFullAccessModesText((config?.fullAccessModes ?? []).join(', '))
    setReasoningEffortKey(config?.reasoningEffortKey ?? '')
    setSystemPromptAppend(config?.systemPromptAppend ?? '')
    setLogoKey(config?.icon ?? seed?.icon ?? '')
    setModelId(agent?.modelId ?? '')
    setReasoningEffort(agent?.reasoningEffort ?? '')
    setPopularOpen(false)
    createAgent.reset()
    updateAgent.reset()
    probe.reset()
  }, [open, agent, preset, createAgent.reset, updateAgent.reset, probe.reset])

  const probeResult = probe.data
  const models = probeResult?.models ?? []
  const reasoningValues = probeResult?.reasoning?.values ?? []
  const probeError = probe.error?.message ?? probeResult?.error?.message
  const pending = createAgent.isPending || updateAgent.isPending
  const submitError = createAgent.error?.message ?? updateAgent.error?.message

  const handleTest = async () => {
    if (!command.trim()) return
    try {
      await probe.mutateAsync({
        command: command.trim(),
        env: parseEnvLines(envText),
        cwd: workingDirectory.trim() || undefined,
      })
    } catch {
      // Surfaced via probe.error below.
    }
  }

  const handleSubmit = async () => {
    if (!name.trim() || !command.trim()) return
    const customConfig = buildCustomConfig({
      command,
      envText,
      fullAccessModesText,
      reasoningEffortKey,
      systemPromptAppend,
      icon: logoKey,
    })
    let createdId: string | undefined
    if (isEdit && agent) {
      await updateAgent.mutateAsync({
        agentId: agent.id,
        patch: {
          name: name.trim(),
          modelId: modelId || null,
          reasoningEffort: reasoningEffort || null,
          workingDirectory: workingDirectory.trim() || null,
          customConfig,
        },
      })
    } else {
      const created = await createAgent.mutateAsync({
        name: name.trim(),
        type: 'custom',
        modelId: modelId || undefined,
        reasoningEffort: reasoningEffort || undefined,
        workingDirectory: workingDirectory.trim() || undefined,
        customConfig,
      })
      createdId = created.id
    }
    onOpenChange(false)
    if (createdId) onSaved?.(createdId)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEdit ? t('stEditCustomAgent') : t('stAddACustomAcpAgent')}
            </DialogTitle>
            <DialogDescription>
              {t('stConnectAnyAgentThatSpeaks')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="custom-agent-name">{t('stName')}</Label>
              <Input
                id="custom-agent-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('stMyAgent')}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="custom-agent-command">{t('stCommand')}</Label>
                <button
                  type="button"
                  onClick={() => setPopularOpen(true)}
                  className="inline-flex items-center gap-1 font-medium text-[var(--accent-brand-ink)] text-xs"
                >
                  <Info className="h-3.5 w-3.5" /> {t('stPopularAgents')}
                </button>
              </div>
              <Input
                id="custom-agent-command"
                className="font-mono text-sm"
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                // i18n-ignore: a sample command
                placeholder="npx -y @scope/my-agent-acp --stdio"
              />
              <p className="text-muted-foreground text-xs">
                {t('stTheFullLaunchCommandArgs')}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="custom-agent-cwd">
                {t('stWorkingDirectory')}
              </Label>
              <Input
                id="custom-agent-cwd"
                className="font-mono text-sm"
                value={workingDirectory}
                onChange={(event) => setWorkingDirectory(event.target.value)}
                placeholder={t('stDefaultsToYourHomeDirectory')}
              />
            </div>

            <Button
              variant="outline"
              onClick={() => void handleTest()}
              disabled={!command.trim() || probe.isPending}
              className="border-[var(--accent-brand)] text-[var(--accent-brand-ink)] hover:bg-[var(--accent-brand)]/10 hover:text-[var(--accent-brand-ink)]"
            >
              {probe.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {t('stTestConnection')}
            </Button>

            {probeResult && !probeResult.error ? (
              <div className="space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                <p className="font-medium text-emerald-600 text-sm dark:text-emerald-400">
                  {t('stConnected')}
                  {probeResult.agentInfo?.name
                    ? ` · ${probeResult.agentInfo.name}`
                    : ''}
                  {probeResult.agentInfo?.version
                    ? ` v${probeResult.agentInfo.version}`
                    : ''}
                </p>
                <div className="space-y-2">
                  <Label>{t('stModel')}</Label>
                  <Select
                    value={modelId || AGENT_DEFAULT}
                    onValueChange={(value) =>
                      setModelId(value === AGENT_DEFAULT ? '' : value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={AGENT_DEFAULT}>
                        {t('stAgentDefault')}
                      </SelectItem>
                      {models.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.name ?? model.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {reasoningValues.length > 0 ? (
                  <div className="space-y-2">
                    <Label>{t('stReasoningEffort')}</Label>
                    <Select
                      value={reasoningEffort || AGENT_DEFAULT}
                      onValueChange={(value) =>
                        setReasoningEffort(value === AGENT_DEFAULT ? '' : value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={AGENT_DEFAULT}>
                          {t('stAgentDefault')}
                        </SelectItem>
                        {reasoningValues.map((effort) => (
                          <SelectItem key={effort} value={effort}>
                            {effort}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>
            ) : null}

            {probeError ? (
              <p className="text-destructive text-sm">{probeError}</p>
            ) : null}

            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-1 font-medium text-muted-foreground text-sm">
                <ChevronDown className="h-4 w-4" /> {t('stAdvanced')}
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-3">
                <div className="space-y-2">
                  <Label htmlFor="custom-agent-env">
                    {t('stEnvironmentVariables')}
                  </Label>
                  <Textarea
                    id="custom-agent-env"
                    className="font-mono text-xs"
                    rows={3}
                    value={envText}
                    onChange={(event) => setEnvText(event.target.value)}
                    // i18n-ignore: a sample of env syntax
                    placeholder={'KEY=value\nANOTHER=value'}
                  />
                  <p className="text-destructive text-xs">
                    {t('stStoredLocallyInPlaintextPrefer')}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="custom-agent-modes">
                    {t('stFullAccessModeIds')}
                  </Label>
                  <Input
                    id="custom-agent-modes"
                    className="font-mono text-sm"
                    value={fullAccessModesText}
                    onChange={(event) =>
                      setFullAccessModesText(event.target.value)
                    }
                    // i18n-ignore: a sample mode id
                    placeholder="bypassPermissions"
                  />
                  <p className="text-muted-foreground text-xs">
                    {t('stCommaSeparatedLeaveEmptyTo')}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="custom-agent-reasoning-key">
                    {t('stReasoningEffortKey')}
                  </Label>
                  <Input
                    id="custom-agent-reasoning-key"
                    className="font-mono text-sm"
                    value={reasoningEffortKey}
                    onChange={(event) =>
                      setReasoningEffortKey(event.target.value)
                    }
                    // i18n-ignore: a sample key
                    placeholder="effort"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="custom-agent-prompt">
                    {t('stSystemPromptAppend')}
                  </Label>
                  <Textarea
                    id="custom-agent-prompt"
                    rows={2}
                    value={systemPromptAppend}
                    onChange={(event) =>
                      setSystemPromptAppend(event.target.value)
                    }
                    placeholder={t('stOptionalExtraInstructions')}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>

            {submitError ? (
              <p className="text-destructive text-sm">{submitError}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('stCancel')}
            </Button>
            <Button
              onClick={() => void handleSubmit()}
              disabled={!name.trim() || !command.trim() || pending}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isEdit ? t('stSaveAgent') : t('stCreateAgent')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PopularAcpAgentsDialog
        open={popularOpen}
        onOpenChange={setPopularOpen}
        onSelect={(selectedCommand, agentId) => {
          setCommand(selectedCommand)
          setLogoKey(agentId)
          setPopularOpen(false)
        }}
      />
    </>
  )
}
