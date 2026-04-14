import { Bot, CheckCircle2, Loader2, XCircle } from 'lucide-react'
import type { FC } from 'react'
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message'
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning'
import type { AgentConversationTurn } from '@/lib/agent-conversations/types'

interface ConversationMessageProps {
  turn: AgentConversationTurn
  streaming: boolean
}

export const ConversationMessage: FC<ConversationMessageProps> = ({
  turn,
  streaming,
}) => (
  <div className="space-y-3">
    <Message from="user">
      <MessageContent>
        <pre className="whitespace-pre-wrap font-sans text-sm">
          {turn.userText}
        </pre>
      </MessageContent>
    </Message>

    {turn.parts.length > 0 && (
      <Message from="assistant">
        <MessageContent>
          {turn.parts.map((part, i) => {
            const key = `${turn.id}-part-${i}`

            switch (part.kind) {
              case 'thinking':
                return (
                  <Reasoning
                    key={key}
                    className="w-full"
                    isStreaming={!part.done}
                    defaultOpen={!part.done}
                  >
                    <ReasoningTrigger />
                    <ReasoningContent>{part.text}</ReasoningContent>
                  </Reasoning>
                )

              case 'tool-batch':
                return (
                  <div key={key} className="w-full space-y-1">
                    {part.tools.map((tool) => (
                      <div
                        key={tool.id}
                        className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                      >
                        {tool.status === 'running' && (
                          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                        )}
                        {tool.status === 'completed' && (
                          <CheckCircle2 className="size-3.5 text-green-500" />
                        )}
                        {tool.status === 'error' && (
                          <XCircle className="size-3.5 text-destructive" />
                        )}
                        <span className="font-mono text-xs">{tool.name}</span>
                        {tool.durationMs != null && (
                          <span className="ml-auto text-muted-foreground text-xs">
                            {(tool.durationMs / 1000).toFixed(1)}s
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )

              case 'text':
                return <MessageResponse key={key}>{part.text}</MessageResponse>

              default:
                return null
            }
          })}
        </MessageContent>
      </Message>
    )}

    {!turn.done && turn.parts.length === 0 && streaming && (
      <div className="flex gap-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-orange)] text-white">
          <Bot className="size-3.5" />
        </div>
        <div className="flex items-center gap-1 rounded-xl rounded-tl-none border border-border/50 bg-card px-3 py-2.5 shadow-sm">
          <span className="size-1.5 animate-bounce rounded-full bg-[var(--accent-orange)] [animation-delay:-0.3s]" />
          <span className="size-1.5 animate-bounce rounded-full bg-[var(--accent-orange)] [animation-delay:-0.15s]" />
          <span className="size-1.5 animate-bounce rounded-full bg-[var(--accent-orange)]" />
        </div>
      </div>
    )}
  </div>
)
