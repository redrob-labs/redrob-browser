/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { Bot } from '@browseros/icons'
// A provider's own mark is a logo, not an interface icon, so it comes from the brand set like the rest.
import {
  Anthropic,
  Azure,
  Bedrock,
  Gemini,
  Github,
  Kimi,
  LmStudio,
  Ollama,
  OpenAI,
  OpenRouter,
  Qwen,
} from '@lobehub/icons'
import type { FC, SVGProps } from 'react'
import { RedrobMark } from '@/components/brand/RedrobMark'
import type { ProviderType } from './types'

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number | string
}

type IconComponent = FC<IconProps>

// The Redrob mark as is: brand marks are never recoloured.
const RedrobConsoleIcon: IconComponent = ({ size = 20, className }) => (
  <RedrobMark alt="Redrob Console" size={size} className={className} />
)

const providerIconMap: Record<ProviderType, IconComponent | null> = {
  anthropic: Anthropic,
  openai: OpenAI,
  'openai-compatible': OpenAI,
  google: Gemini,
  openrouter: OpenRouter,
  azure: Azure,
  ollama: Ollama,
  lmstudio: LmStudio,
  bedrock: Bedrock,
  moonshot: Kimi,
  'redrob-console': RedrobConsoleIcon,
  'chatgpt-pro': OpenAI,
  'github-copilot': Github,
  'qwen-code': Qwen,
}

export interface ProviderIconProps {
  type: ProviderType
  size?: number
  className?: string
}

/**
 * Provider icon component that renders the appropriate icon for each provider type
 * @public
 */
export const ProviderIcon: FC<ProviderIconProps> = ({
  type,
  size = 20,
  className,
}) => {
  const IconComponent = providerIconMap[type]

  if (IconComponent) {
    return <IconComponent size={size} className={className} />
  }

  return <Bot size={size} className={className} />
}
