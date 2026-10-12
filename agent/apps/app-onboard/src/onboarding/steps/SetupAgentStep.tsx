/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { t, tNodes } from '@browseros/i18n'
import { ArrowRight } from '@browseros/icons'
import {
  Anthropic,
  Claude,
  Cohere,
  DeepSeek,
  Gemini,
  Github,
  Grok,
  Groq,
  Kimi,
  Mistral,
  Ollama,
  OpenAI,
  OpenRouter,
  Perplexity,
  Qwen,
} from '@lobehub/icons'
import type { ComponentType } from 'react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Hermes, OpenClaw } from '../components/AgentBrandMarks'
import { DisplayHeading, Em, StepCopy } from '../components/DisplayHeading'
import { StepWrap } from '../components/StepWrap'

interface SetupAgentStepProps {
  onSetup: () => void
}

type MonoIcon = ComponentType<{ size?: number }>
interface IconEntry {
  label: string
  Icon: MonoIcon
}

// Real brand marks from @lobehub/icons (the same source the app uses). The
// default export is the mono icon: a single-path currentColor SVG, so it carries
// no data: URLs or remote refs and stays inside the WebUI resource contract.
const LLM_PROVIDERS: IconEntry[] = [
  { label: 'OpenAI', Icon: OpenAI },
  { label: 'Anthropic', Icon: Anthropic },
  { label: 'Google Gemini', Icon: Gemini },
  { label: 'Mistral', Icon: Mistral },
  { label: 'DeepSeek', Icon: DeepSeek },
  { label: 'xAI Grok', Icon: Grok },
  { label: 'Ollama', Icon: Ollama },
  { label: 'OpenRouter', Icon: OpenRouter },
  { label: 'Moonshot Kimi', Icon: Kimi },
  { label: 'Qwen', Icon: Qwen },
  { label: 'Cohere', Icon: Cohere },
  { label: 'Perplexity', Icon: Perplexity },
  { label: 'Groq', Icon: Groq },
]

const CODING_AGENTS: IconEntry[] = [
  { label: 'Claude Code', Icon: Claude },
  { label: 'Codex', Icon: OpenAI },
  { label: 'GitHub Copilot', Icon: Github },
  { label: 'Gemini CLI', Icon: Gemini },
  { label: 'Qwen Code', Icon: Qwen },
  { label: 'OpenClaw', Icon: OpenClaw },
  { label: 'Hermes', Icon: Hermes },
]

function IconChip({ label, Icon }: IconEntry) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="grid size-[42px] place-items-center rounded-[10px] border border-border bg-card text-foreground transition-all duration-150 hover:-translate-y-0.5 hover:border-accent hover:shadow-[0_6px_14px_var(--color-accent-tint)]" />
        }
      >
        <Icon size={23} />
        <span className="sr-only">{label}</span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Final step. The actual provider / agent setup lives in the full BrowserOS app;
 * this screen shows the breadth of what is supported and hands off.
 * `bridge.complete()` lets the native first-run finish and open the app on the
 * first-run setup screen, which is where connecting actually happens.
 *
 * One exit, deliberately. A "later" button here read as though BrowserOS would
 * work without a provider, and it no longer does.
 */
export function SetupAgentStep({ onSetup }: SetupAgentStepProps) {
  return (
    <TooltipProvider>
      <StepWrap>
        <DisplayHeading>
          {tNodes(
            'onboardSetUpHeading',
            <Em key="em">{t('onboardSetUpHeadingEm')}</Em>,
          )}
        </DisplayHeading>
        <StepCopy>{t('onboardStartWithRedrobCodeRedrob')}</StepCopy>
        <div className="mb-6 flex max-w-[480px] flex-col gap-[18px]">
          {/* Redrob Code first, and whole: the product's own agent is the default answer to this
              step, not one chip among a dozen. The mark is the product icon the onboarding build
              already ships under icon/. */}
          <div className="flex items-center gap-3.5 rounded-[14px] border border-accent bg-accent-tint px-4 py-3.5">
            <img
              src="/icon/48.png"
              alt=""
              width={36}
              height={36}
              className="shrink-0 rounded-[9px]"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 font-bold text-[15px] text-foreground">
                Redrob Code
                <span className="rounded-full bg-card px-2 py-0.5 font-bold text-[10px] text-accent uppercase tracking-[0.08em]">
                  {t('onboardRecommended')}
                </span>
              </div>
              <div className="mt-0.5 text-[13px] text-ink-3">
                {t('onboardRedrobSOwnAgentMade')}
              </div>
            </div>
          </div>
          <div>
            <div className="mb-2.5 font-bold text-[11px] text-ink-3 uppercase tracking-[0.08em]">
              {t('onboardAnyLlmProvider')}
            </div>
            <div className="flex flex-wrap gap-2">
              {LLM_PROVIDERS.map((entry) => (
                <IconChip key={entry.label} {...entry} />
              ))}
              <span className="grid size-[42px] place-items-center rounded-[10px] bg-accent-tint font-bold text-[12px] text-accent">
                +40
              </span>
            </div>
          </div>
          <div>
            <div className="mb-2.5 font-bold text-[11px] text-ink-3 uppercase tracking-[0.08em]">
              {t('onboardOrACodingAgentHarness')}
            </div>
            <div className="flex flex-wrap gap-2">
              {CODING_AGENTS.map((entry) => (
                <IconChip key={entry.label} {...entry} />
              ))}
            </div>
            <div className="mt-2.5 text-[13px] text-ink-3">
              {t('onboardOrAnyOtherAcpCompatible')}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="lg" onClick={onSetup}>
            {t('onboardSetUpMyAgent')}
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </StepWrap>
    </TooltipProvider>
  )
}
