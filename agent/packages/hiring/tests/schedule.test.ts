/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'bun:test'
import {
  chosenSlot,
  formatSlot,
  parseBusy,
  proposeSlots,
  zonedTime,
} from '../src/schedule'

/** Monday 12 Oct 2026, 09:00 in Seoul. */
const NOW = Date.UTC(2026, 9, 12, 0)
const SEOUL = 'Asia/Seoul'

describe('interview times', () => {
  it('reads busy times from Google freeBusy, Outlook getSchedule and event lists', () => {
    const google = {
      calendars: {
        primary: {
          busy: [
            { start: '2026-10-13T05:00:00Z', end: '2026-10-13T06:00:00Z' },
          ],
        },
      },
    }
    const outlook = {
      value: [
        {
          scheduleItems: [
            {
              status: 'busy',
              start: {
                dateTime: '2026-10-14T01:00:00.0000000',
                timeZone: 'UTC',
              },
              end: { dateTime: '2026-10-14T02:00:00.0000000', timeZone: 'UTC' },
            },
            {
              status: 'free',
              start: { dateTime: '2026-10-14T03:00:00', timeZone: 'UTC' },
              end: { dateTime: '2026-10-14T04:00:00', timeZone: 'UTC' },
            },
          ],
        },
      ],
    }
    expect(parseBusy(google)).toEqual([
      {
        start: Date.parse('2026-10-13T05:00:00Z'),
        end: Date.parse('2026-10-13T06:00:00Z'),
      },
    ])
    expect(parseBusy(JSON.stringify(outlook))).toEqual([
      {
        start: Date.parse('2026-10-14T01:00:00Z'),
        end: Date.parse('2026-10-14T02:00:00Z'),
      },
    ])
    expect(
      parseBusy({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              items: [
                {
                  start: { dateTime: '2026-10-15T10:00:00+09:00' },
                  end: { dateTime: '2026-10-15T11:00:00+09:00' },
                  transparency: 'transparent',
                },
              ],
            }),
          },
        ],
      }),
    ).toEqual([])
  })

  it('offers three free slots in interview hours, on separate business days, mid-morning first', () => {
    // Tuesday 14:00–17:00 Seoul is busy all afternoon.
    const busy = [
      {
        start: zonedTime(2026, 9, 13, 10, 0, SEOUL),
        end: zonedTime(2026, 9, 13, 17, 0, SEOUL),
      },
    ]
    const slots = proposeSlots(busy, NOW, SEOUL)
    expect(slots).toHaveLength(3)
    const shown = slots.map((s) => formatSlot(s, SEOUL, 'en-GB'))
    expect(shown).toEqual([
      'Wed 14 Oct, 11:00–11:30 (Asia/Seoul)',
      'Thu 15 Oct, 11:00–11:30 (Asia/Seoul)',
      'Fri 16 Oct, 11:00–11:30 (Asia/Seoul)',
    ])
    expect(formatSlot(slots[0] as never, 'Asia/Kolkata', 'en-GB')).toBe(
      'Wed 14 Oct, 07:30–08:00 (Asia/Kolkata)',
    )
  })

  it('skips weekends', () => {
    const friday = Date.UTC(2026, 9, 16, 0)
    const slots = proposeSlots([], friday, SEOUL, {
      from: 10,
      to: 17,
      length: 30,
      count: 1,
      firstDay: 1,
      lastDay: 7,
    })
    expect(formatSlot(slots[0] as never, SEOUL, 'en-GB')).toStartWith(
      'Mon 19 Oct',
    )
  })

  it('reads which slot a reply picks, or leaves it to the recruiter', () => {
    const slots = proposeSlots([], NOW, SEOUL)
    expect(chosenSlot('The second one works for me', slots, SEOUL)).toBe(1)
    expect(chosenSlot('두 번째 시간이 좋아요', slots, SEOUL)).toBe(1)
    expect(chosenSlot('11:00 on Thursday please', slots, SEOUL)).toBeNull()
    expect(chosenSlot('Any is fine', slots, SEOUL)).toBeNull()
  })
})
