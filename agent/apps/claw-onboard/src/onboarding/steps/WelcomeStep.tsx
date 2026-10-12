/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { t, tNodes } from '@browseros/i18n'
import { Zap } from '@browseros/icons'
import { Button } from '@/components/ui/button'
import { DisplayHeading, Em, StepCopy } from '../components/DisplayHeading'
import { StepWrap } from '../components/StepWrap'

interface WelcomeStepProps {
  onPrimary: () => void
  onSkip: () => void
}

/** Renders the opening onboarding step and setup/reconnect choices. */
export function WelcomeStep({ onPrimary, onSkip }: WelcomeStepProps) {
  return (
    <StepWrap>
      <DisplayHeading>
        {tNodes('clawSecondBrowser', <Em key="em">{t('clawAgents')}</Em>)}
      </DisplayHeading>
      <StepCopy>{t('clawNotAChromeReplacementThis')}</StepCopy>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="lg" onClick={onPrimary}>
          <Zap className="size-4" />
          {t('clawSetItUp')}
        </Button>
        <Button type="button" size="lg" variant="ghost" onClick={onSkip}>
          {t('clawAlreadySetUpReconnect')}
        </Button>
      </div>
    </StepWrap>
  )
}
