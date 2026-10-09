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
import { Button } from '@/components/ui/button'
import { DisplayHeading, Em, StepCopy } from '../components/DisplayHeading'
import { StepWrap } from '../components/StepWrap'

interface WelcomeStepProps {
  onPrimary: () => void
  onSkip: () => void
}

/** Opening step: names the two things onboarding will do, then gets out of the way. */
export function WelcomeStep({ onPrimary, onSkip }: WelcomeStepProps) {
  return (
    <StepWrap>
      <DisplayHeading>
        {tNodes('onboardWelcomeHeading', <Em key="em">Redrob</Em>)}
      </DisplayHeading>
      <StepCopy>{t('onboardTwoQuickStepsToGet')}</StepCopy>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="lg" onClick={onPrimary}>
          {t('onboardGetStarted')}
          <ArrowRight className="size-4" />
        </Button>
        <Button type="button" size="lg" variant="ghost" onClick={onSkip}>
          {t('onboardSkipForNow')}
        </Button>
      </div>
    </StepWrap>
  )
}
