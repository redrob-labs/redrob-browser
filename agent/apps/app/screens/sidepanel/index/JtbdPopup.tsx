/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { t } from '@browseros/i18n'
import { MessageSquareHeart, X } from '@browseros/icons'
import { type FC, useState } from 'react'
import { Message, MessageContent } from '@/components/ai-elements/message'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'

export interface JtbdPopupProps {
  onTakeSurvey: (opts?: { dontShowAgain?: boolean }) => void
  onDismiss: (dontShowAgain: boolean) => void
  showDontShowAgain: boolean
}

export const JtbdPopup: FC<JtbdPopupProps> = ({
  onTakeSurvey,
  onDismiss,
  showDontShowAgain,
}) => {
  const [dontShowAgain, setDontShowAgain] = useState(false)

  return (
    <Message from="assistant">
      <MessageContent>
        <div className="relative rounded-lg border border-border/50 bg-card p-4 shadow-sm">
          <button
            type="button"
            onClick={() => onDismiss(dontShowAgain)}
            className="absolute top-2 right-2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-start gap-3 pr-6">
            <MessageSquareHeart className="h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="font-medium text-sm">{t('spSurveyTitle')}</p>
              <p className="mt-1 text-muted-foreground text-xs">
                {t('spSurveyDesc')}
              </p>
            </div>
          </div>

          {showDontShowAgain && (
            <label
              htmlFor="jtbd-dont-show-again"
              className="mt-3 flex items-center gap-2 text-muted-foreground text-xs"
            >
              <Checkbox
                id="jtbd-dont-show-again"
                checked={dontShowAgain}
                onCheckedChange={(checked) =>
                  setDontShowAgain(checked === true)
                }
              />
              {t('spDontShowAgain')}
            </label>
          )}

          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => onTakeSurvey({ dontShowAgain })}>
              {t('spTakeSurvey')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDismiss(dontShowAgain)}
            >
              {t('spMaybeLater')}
            </Button>
          </div>
        </div>
      </MessageContent>
    </Message>
  )
}
