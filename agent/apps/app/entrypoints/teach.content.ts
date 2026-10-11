/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Teach Mode's recorder. It does nothing unless this tab is being taught, and then records meaning:
 * the page, the control pressed (its role and accessible name), the field typed into (its label) and,
 * only when it holds no private detail, the value. No DOM, no selectors, no screenshots, no keystrokes.
 */

import {
  classifyValue,
  isSecretField,
  type TeachEvent,
} from '@browseros/playbooks/teach'
import {
  RuntimeMessageType,
  sendRuntimeMessage,
} from '@/lib/messaging/runtime/runtimeMessages'
import {
  MAX_TEACH_EVENTS,
  type TeachSession,
  teachEventsStorage,
  teachSessionStorage,
} from '@/lib/playbooks/teachStorage'

const text = (value: string | null | undefined, max = 120) =>
  (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

function accessibleName(el: Element): string {
  return text(
    el.getAttribute('aria-label') ||
      el.getAttribute('title') ||
      (el as HTMLElement).innerText ||
      el.getAttribute('value') ||
      el.querySelector('img[alt]')?.getAttribute('alt'),
  )
}

function fieldLabel(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): string {
  const byLabel = el.labels?.[0]?.innerText
  return text(
    el.getAttribute('aria-label') ||
      byLabel ||
      el.getAttribute('placeholder') ||
      el.name ||
      el.id,
    80,
  )
}

export default defineContentScript({
  matches: ['https://*/*'],
  runAt: 'document_idle',
  async main(ctx) {
    const response = await sendRuntimeMessage(RuntimeMessageType.getTabId)
    const tabId = response?.tabId
    if (!tabId) return
    let session: TeachSession | null = await teachSessionStorage.getValue()
    const active = () =>
      !!session && !session.paused && session.tabIds.includes(tabId)
    const unwatch = teachSessionStorage.watch((next) => {
      session = next
    })
    ctx.onInvalidated(unwatch)

    const record = async (event: TeachEvent) => {
      if (!active()) return
      const events = await teachEventsStorage.getValue()
      if (events.length >= MAX_TEACH_EVENTS) return
      events.push(event)
      await teachEventsStorage.setValue(events)
    }

    void record({
      kind: 'navigate',
      url: location.href,
      title: text(document.title),
      at: Date.now(),
    })

    document.addEventListener(
      'click',
      (event) => {
        const target = (event.target as Element | null)?.closest(
          'button, a[href], [role="button"], [role="link"], [role="menuitem"], [role="tab"], input[type="submit"], input[type="button"], label',
        )
        if (!target) return
        const role =
          target.getAttribute('role') ??
          (target.tagName === 'A' ? 'link' : 'button')
        void record({
          kind: 'click',
          url: location.href,
          role,
          name: accessibleName(target),
          at: Date.now(),
        })
      },
      { capture: true },
    )

    document.addEventListener(
      'change',
      (event) => {
        const el = event.target
        if (
          !(
            el instanceof HTMLInputElement ||
            el instanceof HTMLTextAreaElement ||
            el instanceof HTMLSelectElement
          )
        ) {
          return
        }
        if (
          el instanceof HTMLInputElement &&
          ['checkbox', 'radio', 'file', 'submit', 'button'].includes(el.type)
        ) {
          return
        }
        const secret =
          el instanceof HTMLInputElement &&
          isSecretField({
            type: el.type,
            autocomplete: el.autocomplete,
            name: `${el.name} ${el.id}`,
          })
        const value =
          el instanceof HTMLSelectElement
            ? text(el.selectedOptions[0]?.text)
            : el.value
        const valueClass = secret ? 'secret' : classifyValue(value)
        void record({
          kind: 'input',
          url: location.href,
          field: fieldLabel(el),
          value: valueClass === 'text' ? value.slice(0, 2000) : undefined,
          valueClass,
          at: Date.now(),
        })
      },
      { capture: true },
    )

    document.addEventListener(
      'submit',
      (event) => {
        const form = event.target as HTMLFormElement
        const submitter = (event as SubmitEvent).submitter
        void record({
          kind: 'submit',
          url: location.href,
          name: submitter
            ? accessibleName(submitter)
            : text(form.getAttribute('aria-label')),
          at: Date.now(),
        })
      },
      { capture: true },
    )
  },
})
