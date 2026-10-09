/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { CircleAlert, LoaderCircle } from '@browseros/icons'
import { Button } from '@/components/ui/button'
import { DisplayHeading, StepCopy } from '../components/DisplayHeading'

interface SetupStepProps {
  failed: boolean
  onRetry: () => void
}

/** Holds the browser-owned WebUI open while native prepares the product extension.
 * Native owns success navigation; this view only offers recovery after failure. */
export function SetupStep({ failed, onRetry }: SetupStepProps) {
  return (
    <div className="flex flex-1 items-center">
      <div className="w-full max-w-[560px]">
        <div role={failed ? 'alert' : 'status'} aria-atomic="true">
          {failed ? (
            <CircleAlert
              aria-hidden="true"
              className="mb-6 size-8 text-accent"
            />
          ) : (
            <LoaderCircle
              aria-hidden="true"
              className="mb-6 size-8 text-accent motion-safe:animate-spin"
            />
          )}
          <DisplayHeading>
            {failed ? 'Setup didn’t finish' : 'Finishing setup'}
          </DisplayHeading>
          <StepCopy>
            {failed
              ? 'Please try again.'
              : 'Preparing Redrob. This should only take a moment.'}
          </StepCopy>
        </div>
        {failed && (
          <Button type="button" size="lg" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    </div>
  )
}
