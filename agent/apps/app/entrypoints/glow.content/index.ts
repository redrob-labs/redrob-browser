/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import confetti from 'canvas-confetti'
import {
  RuntimeMessageType,
  sendRuntimeMessage,
} from '@/lib/messaging/runtime/runtimeMessages'
import type { GlowMessage } from './GlowMessage'

const GLOW_OVERLAY_ID = 'browseros-glow-overlay'
const GLOW_STYLES_ID = 'browseros-glow-styles'
const GLOW_STOP_BTN_ID = 'browseros-glow-stop-btn'

/**
 * The design system's values, written out: this stylesheet lands on arbitrary pages, where none of
 * tokens.css exists and a page's own `--blue-6` could mean anything.
 */
const RR = {
  blue6: '#2b52ff', // action-primary, focus-ring
  teal3: '#6ff4f0', // the brand gradient's far stop
  red4: '#a31310', // status-danger
  red5: '#560100', // its pressed step
  white: '#ffffff',
  tickAngle: '40deg', // the rake of the mark
  gradientAngle: '130deg', // --gradient-brand
  entrance: 'cubic-bezier(0.05, 0.7, 0.1, 1)', // --easing-entrance
  standard: 'cubic-bezier(0.2, 0, 0, 1)', // --easing-standard
  shadowMd: '0 4px 12px rgba(10, 11, 12, 0.10)',
} as const

let activeConversationId: string | null = null

/**
 * The agent is working: the page is framed, not tinted.
 *
 * - The frame is the brand gradient (--gradient-brand, Blue 6 to Teal 3 at 130 degrees), 3px, drawn on
 *   the border box only, so nothing on the page changes colour under it.
 * - A soft inner Blue 6 edge breathes behind it once every 3.2s, and a light passes along the frame on
 *   the 40 degree rake: the arrival at 1400ms, then one pass every 4.2s, the cadence of the system's
 *   MarkReveal hand-off -- slow enough never to nag, present enough to read as still working.
 * - Reduced motion: the frame and the edge are simply there. No breath and no pass.
 * - The stop button is the system's round danger IconButton at lg (48px): Red 4, Red 5 when pressed, a
 *   name for a screen reader, and the focus ring.
 */
function injectStyles(): void {
  if (document.getElementById(GLOW_STYLES_ID)) {
    return
  }

  const style = document.createElement('style')
  style.id = GLOW_STYLES_ID
  style.textContent = `
    @keyframes browseros-glow-breathe {
      0%, 100% { box-shadow: inset 0 0 40px 10px rgba(43, 82, 255, 0.14); }
      50%      { box-shadow: inset 0 0 56px 16px rgba(43, 82, 255, 0.22); }
    }
    @keyframes browseros-glow-arrive {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes browseros-glow-pass {
      0%   { background-position: 0 0, 124% 124%; }
      33%  { background-position: 0 0, -30% -30%; }
      100% { background-position: 0 0, -30% -30%; }
    }

    #${GLOW_OVERLAY_ID} {
      position: fixed !important;
      inset: 0 !important;
      pointer-events: none !important;
      z-index: 2147483647 !important;
      opacity: 0;
      animation:
        browseros-glow-arrive 1400ms ${RR.entrance} forwards,
        browseros-glow-breathe 3200ms ${RR.standard} infinite !important;
    }
    #${GLOW_OVERLAY_ID}::before {
      content: "";
      position: absolute;
      inset: 0;
      padding: 3px;
      background:
        linear-gradient(${RR.gradientAngle}, ${RR.blue6} 0%, ${RR.teal3} 100%),
        linear-gradient(${RR.gradientAngle}, transparent 40%, rgba(255, 255, 255, 0.9) 50%, transparent 60%);
      background-size: 100% 100%, 300% 300%;
      background-blend-mode: normal, screen;
      -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
      -webkit-mask-composite: xor;
      mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
      animation: browseros-glow-pass 4200ms ${RR.entrance} 1400ms infinite;
    }

    #${GLOW_STOP_BTN_ID} {
      all: initial;
      position: fixed !important;
      bottom: 24px !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      width: 48px !important;
      height: 48px !important;
      border-radius: 9999px !important;
      background: ${RR.red4} !important;
      color: ${RR.white} !important;
      border: 0 !important;
      pointer-events: auto !important;
      cursor: pointer !important;
      z-index: 2147483647 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      box-shadow: ${RR.shadowMd} !important;
      opacity: 0;
      animation: browseros-glow-arrive 220ms ${RR.entrance} forwards !important;
      transition: background-color 80ms ${RR.standard};
    }
    #${GLOW_STOP_BTN_ID}:hover,
    #${GLOW_STOP_BTN_ID}:active {
      background: ${RR.red5} !important;
    }
    #${GLOW_STOP_BTN_ID}:focus-visible {
      outline: 2px solid ${RR.blue6} !important;
      outline-offset: 2px !important;
    }

    @media (prefers-reduced-motion: reduce) {
      #${GLOW_OVERLAY_ID} {
        opacity: 1;
        animation: none !important;
        box-shadow: inset 0 0 48px 12px rgba(43, 82, 255, 0.18);
      }
      #${GLOW_OVERLAY_ID}::before { animation: none; }
      #${GLOW_STOP_BTN_ID} { opacity: 1; animation: none !important; }
    }
  `
  const appendStyle = () => document.head.appendChild(style)

  if (document.head) {
    appendStyle()
  } else {
    document.addEventListener('DOMContentLoaded', appendStyle, { once: true })
  }
}

function startGlow(): void {
  stopGlow()
  injectStyles()

  const overlay = document.createElement('div')
  overlay.id = GLOW_OVERLAY_ID

  const button = document.createElement('button')
  button.id = GLOW_STOP_BTN_ID
  button.type = 'button'
  // The page's language is not ours, so the name is the browser UI's: chrome.i18n follows it.
  const label = browser.i18n.getMessage('glowStopAgent') || 'Stop the agent'
  button.setAttribute('aria-label', label)
  button.title = label
  button.innerHTML =
    '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="12" height="12" rx="2"/></svg>'
  button.addEventListener('click', () => {
    if (activeConversationId) {
      void sendRuntimeMessage(RuntimeMessageType.stopAgent, {
        conversationId: activeConversationId,
      })
    }
  })

  overlay.appendChild(button)

  const appendOverlay = () => document.body.appendChild(overlay)

  if (document.body) {
    appendOverlay()
  } else {
    document.addEventListener('DOMContentLoaded', appendOverlay, { once: true })
  }
}

function fireConfetti(): void {
  // Redrob Blue 6 and 4, then the system's teal, violet and pink accents.
  const colors = ['#2b52ff', '#8aafff', '#6ff4f0', '#8944ff', '#ff39ba']
  const defaults = { colors, ticks: 200, gravity: 1.2, decay: 0.94 }

  confetti({
    ...defaults,
    particleCount: 80,
    spread: 70,
    origin: { x: 0.3, y: 0.6 },
    angle: 60,
  })
  confetti({
    ...defaults,
    particleCount: 80,
    spread: 70,
    origin: { x: 0.7, y: 0.6 },
    angle: 120,
  })

  setTimeout(() => {
    confetti({
      ...defaults,
      particleCount: 60,
      spread: 100,
      origin: { x: 0.5, y: 0.7 },
    })
  }, 150)

  setTimeout(() => {
    confetti({
      ...defaults,
      particleCount: 40,
      spread: 120,
      origin: { x: 0.4, y: 0.65 },
      angle: 75,
    })
    confetti({
      ...defaults,
      particleCount: 40,
      spread: 120,
      origin: { x: 0.6, y: 0.65 },
      angle: 105,
    })
  }, 350)
}

function stopGlow(): void {
  const overlay = document.getElementById(GLOW_OVERLAY_ID)
  if (overlay) {
    overlay.remove()
  }
}

export default defineContentScript({
  matches: ['*://*/*'],
  runAt: 'document_start',
  main() {
    browser.runtime.onMessage.addListener(
      (message: GlowMessage, _sender, sendResponse) => {
        if (
          typeof message !== 'object' ||
          !('conversationId' in message) ||
          !('isActive' in message)
        ) {
          return
        }

        if (message.isActive) {
          activeConversationId = message.conversationId
          startGlow()
        } else if (message.conversationId === activeConversationId) {
          activeConversationId = null
          stopGlow()
          if (message.showConfetti) {
            fireConfetti()
          }
        }

        sendResponse({ success: true })
        return true
      },
    )

    window.addEventListener('beforeunload', stopGlow)

    document.addEventListener('visibilitychange', () => {
      // If user navigates away from the tab, remove the glow overlay - no need to re-enable it when they return
      if (document.hidden) {
        stopGlow()
      }
    })
  },
})
