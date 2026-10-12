/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Candidate } from '@browseros/hiring/candidate'
import { formatSlot } from '@browseros/hiring/schedule'
import { HiringScheduling } from '../../../src/api/services/hiring-scheduling'
import type { BrowserToolCall } from '../../../src/api/services/mcp/browser-tool-dispatch'
import {
  afterConnectorCall,
  authorizeConnectorCall,
  guardHiringSend,
  setSchedulingSource,
} from '../../../src/api/services/mcp/guards/hiring-send'
import { openBrowserOsDatabase } from '../../../src/lib/db/client'
import { HiringStore } from '../../../src/lib/hiring/store'

const dirs: string[] = []
afterEach(() => {
  setSchedulingSource(null)
  while (dirs.length) rmSync(dirs.pop() ?? '', { recursive: true, force: true })
})

const arjun: Candidate = {
  url: 'https://github.com/arjun',
  site: 'github',
  name: 'Arjun Mehta',
  positions: [],
  education: [],
  skills: [],
  location: 'Bengaluru',
  languages: [],
  links: [],
  contact: [{ kind: 'email', value: 'arjun@example.com' }],
}

/** Monday 12 Oct 2026, 09:00 in Seoul. */
const NOW = Date.UTC(2026, 9, 12, 0)

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'redrob-schedule-'))
  dirs.push(dir)
  const { db } = openBrowserOsDatabase({ dbPath: join(dir, 'db.sqlite') })
  const store = new HiringStore(db, {
    now: () => NOW,
    saltPath: join(dir, 'salt'),
  })
  const scheduling = new HiringScheduling(store, {
    now: () => NOW,
    timeZone: 'Asia/Seoul',
  })
  setSchedulingSource(scheduling)
  const { role } = store.createRole({ title: 'Backend Engineer', criteria: [] })
  const { personId } = await store.upsertPerson(role.id, arjun)
  return { store, scheduling, role, personId }
}

const call = (tool: string) =>
  ({
    tool: { name: tool },
    args: {},
    lease: { conversationId: 'c1' },
  }) as unknown as BrowserToolCall

describe('Talent Scout interview scheduling', () => {
  it('reads busy times without changing the calendar, then offers three free slots', async () => {
    const { scheduling, role, personId } = await setup()
    const { instruction } = scheduling.startRead(role.id, personId, {
      connector: 'Google Calendar',
      conversationId: 'c1',
    })
    expect(instruction).toContain('Do not create, change')
    expect(guardHiringSend(call('navigate'))?.isError).toBe(true)
    expect(
      authorizeConnectorCall('c1', 'execute_action', {
        server_name: 'Google Calendar',
        action_name: 'google_calendar_create_event',
      }),
    ).toBeDefined()
    expect(
      authorizeConnectorCall('c1', 'execute_action', {
        server_name: 'Outlook Calendar',
        action_name: 'get_schedule',
      }),
    ).toBeDefined()
    const read = {
      server_name: 'Google Calendar',
      action_name: 'google_calendar_freebusy',
    }
    expect(authorizeConnectorCall('c1', 'execute_action', read)).toBeUndefined()
    // Wednesday 11:00–11:30 Seoul is busy, so Wednesday's offer moves.
    afterConnectorCall('c1', 'execute_action', read, {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            calendars: {
              primary: {
                busy: [
                  {
                    start: '2026-10-14T02:00:00Z',
                    end: '2026-10-14T02:30:00Z',
                  },
                ],
              },
            },
          }),
        },
      ],
    })
    const interview = scheduling.end('c1')
    expect(interview?.status).toBe('offered')
    expect(
      interview?.slots.map((s) => formatSlot(s, 'Asia/Seoul', 'en-GB')),
    ).toEqual([
      'Tue 13 Oct, 11:00–11:30 (Asia/Seoul)',
      'Wed 14 Oct, 11:30–12:00 (Asia/Seoul)',
      'Thu 15 Oct, 11:00–11:30 (Asia/Seoul)',
    ])
  })

  it('needs the recruiter when nothing came back from the calendar', async () => {
    const { scheduling, role, personId } = await setup()
    scheduling.startRead(role.id, personId, {
      connector: 'Outlook Calendar',
      conversationId: 'c1',
    })
    expect(scheduling.end('c1')?.status).toBe('needs-you')
  })

  it('books exactly the chosen slot with the candidate as the only guest, and moves them to Interview', async () => {
    const { scheduling, store, role, personId } = await setup()
    scheduling.startRead(role.id, personId, {
      connector: 'Google Calendar',
      conversationId: 'c1',
    })
    afterConnectorCall(
      'c1',
      'execute_action',
      { server_name: 'Google Calendar', action_name: 'freebusy' },
      { calendars: { primary: { busy: [] } } },
    )
    const offered = scheduling.end('c1')
    if (!offered) throw new Error()
    expect(
      scheduling.choose(
        offered.id,
        { reply: 'The second one works' },
        'Asia/Kolkata',
      )?.chosen,
    ).toBe(1)
    const slot = offered.slots[1] as { start: number; end: number }
    scheduling.startBook(offered.id, 'c2')
    const create = (overrides: Record<string, unknown> = {}) => ({
      server_name: 'Google Calendar',
      action_name: 'google_calendar_create_event',
      body_schema: JSON.stringify({
        summary: 'Backend Engineer interview: Arjun Mehta',
        start: { dateTime: new Date(slot.start).toISOString() },
        end: { dateTime: new Date(slot.end).toISOString() },
        attendees: [{ email: 'arjun@example.com' }],
        ...overrides,
      }),
    })
    expect(
      authorizeConnectorCall(
        'c2',
        'execute_action',
        create({ start: { dateTime: '2026-10-20T01:00:00Z' } }),
      ),
    ).toBeDefined()
    expect(
      authorizeConnectorCall(
        'c2',
        'execute_action',
        create({
          attendees: [
            { email: 'arjun@example.com' },
            { email: 'x@example.com' },
          ],
        }),
      ),
    ).toBeDefined()
    expect(
      authorizeConnectorCall('c2', 'execute_action', {
        server_name: 'Google Calendar',
        action_name: 'google_calendar_delete_event',
      }),
    ).toBeDefined()
    expect(
      authorizeConnectorCall('c2', 'execute_action', create()),
    ).toBeUndefined()
    afterConnectorCall('c2', 'execute_action', create(), { id: 'evt' })
    expect(scheduling.get(offered.id)?.status).toBe('booked')
    expect(store.peopleOnRole(role.id)[0]?.stage).toBe('interview')
    expect(store.record(role.id).at(-2)?.kind).toBe('interview-booked')
  })
})
