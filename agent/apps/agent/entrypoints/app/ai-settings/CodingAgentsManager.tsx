import type { FC } from 'react'
import { AgentList } from '@/entrypoints/app/agents/AgentList'
import { NewAgentDialog } from '@/entrypoints/app/agents/NewAgentDialog'
import { InlineErrorAlert } from '@/entrypoints/app/agents/PageAlerts'
import type { CodingAgentsController } from './useCodingAgents'

/**
 * Bottom-of-page management surface for coding agents: the list of existing
 * Claude Code / Codex agents plus the shared New Agent dialog (opened from the
 * provider-template cards). The list is hidden when there are no agents, but
 * the dialog is always mounted so creation works from the cards.
 */
export const CodingAgentsManager: FC<{
  controller: CodingAgentsController
}> = ({ controller }) => {
  const {
    adapters,
    agents,
    listItems,
    activity,
    harnessAgentLookup,
    loading,
    pageError,
    dismissPageError,
    deletingAgentKey,
    deleteIsPending,
    createOpen,
    createAdapter,
    createAdapterId,
    newName,
    modelId,
    reasoningEffort,
    createError,
    creating,
    openCreate,
    closeCreate,
    handleCreate,
    handleDelete,
    handlePinToggle,
    setNewName,
    setModelId,
    setReasoningEffort,
  } = controller

  return (
    <>
      {agents.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h2 className="font-semibold text-lg">Your agents</h2>
            <p className="text-muted-foreground text-sm">
              Claude Code and Codex agents you've created.
            </p>
          </div>
          {pageError ? (
            <InlineErrorAlert
              message={pageError}
              onDismiss={dismissPageError}
            />
          ) : null}
          <AgentList
            agents={listItems}
            activity={activity}
            harnessAgentLookup={harnessAgentLookup}
            adapters={adapters}
            loading={loading}
            deletingAgentKey={deleteIsPending ? deletingAgentKey : null}
            onCreateAgent={() => {
              if (adapters[0]) openCreate(adapters[0].id)
            }}
            onDeleteAgent={(agent) => {
              void handleDelete(agent)
            }}
            onPinToggle={handlePinToggle}
          />
        </section>
      ) : null}

      <NewAgentDialog
        adapters={createAdapter ? [createAdapter] : []}
        createError={createError}
        createRuntime={createAdapterId ?? 'claude'}
        creating={creating}
        defaultProviderId=""
        harnessAdapterId={createAdapterId ?? 'claude'}
        harnessModelId={modelId}
        harnessReasoningEffort={reasoningEffort}
        hermesProviders={[]}
        hermesSelectedProviderId=""
        name={newName}
        open={createOpen}
        onCreate={handleCreate}
        onOpenChange={(open) => {
          if (!open) closeCreate()
        }}
        onRuntimeChange={() => {}}
        onHarnessAdapterChange={() => {}}
        onHarnessModelChange={setModelId}
        onHarnessReasoningChange={setReasoningEffort}
        onHermesProviderChange={() => {}}
        onNameChange={setNewName}
      />
    </>
  )
}
