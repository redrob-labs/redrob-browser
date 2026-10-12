/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The optional API connections for saving to an ATS (Recruit plan §4.4), one client per system behind
 * one interface. Each does three things and nothing else: find the person, add them as a prospect when
 * they are not there, and add a note. No client has a method that rejects, archives, dispositions or
 * moves a stage: stage moves go through the browser, where the recruiter sees the ATS's own stages.
 *
 *   Greenhouse  Harvest v3 (v1 and v2 are reported to shut down after 31 August 2026). OAuth client
 *               credentials: the admin creates a "Harvest V3 (OAuth)" credential and gives the ID and
 *               secret. https://harvestdocs.greenhouse.io/docs/authentication
 *   Lever       the Data API with an admin's key (Basic). Creating needs a `perform_as` user: the
 *               recruiter's own Lever user, found by their email. https://hire.lever.co/developer/documentation
 *   Ashby       an admin's key (Basic). https://developers.ashbyhq.com/
 */

import type { ConnectableAts } from '@browseros/hiring/ats'
import { splitName } from '@browseros/hiring/ats'

export type AtsCredential =
  | {
      ats: 'greenhouse'
      clientId: string
      clientSecret: string
      /** A Greenhouse user id to act as; by default the credential's integration user. */
      userId?: string
    }
  | { ats: 'lever'; key: string; email: string; userId?: string }
  | { ats: 'ashby'; key: string }

export interface AtsPerson {
  name: string
  /** An address the person published or applied with. */
  email?: string
  profileUrl: string
  headline?: string
}

export interface AtsClient {
  readonly ats: ConnectableAts
  /** Checks the key works; returns the credential to store (with anything it resolved). */
  verify(): Promise<AtsCredential>
  find(person: AtsPerson): Promise<string | null>
  addProspect(person: AtsPerson): Promise<string>
  addNote(candidateId: string, note: string): Promise<void>
}

export type AtsErrorCode =
  | 'bad-key'
  | 'no-permission'
  | 'no-user'
  | 'rejected'
  | 'unreachable'

export class AtsError extends Error {
  constructor(
    readonly code: AtsErrorCode,
    message?: string,
  ) {
    super(message ?? code)
  }
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

const basic = (user: string, password = '') =>
  `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`

async function call<T>(
  fetcher: Fetch,
  url: string,
  init: RequestInit,
): Promise<T> {
  let response: Response
  try {
    response = await fetcher(url, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(20_000),
    })
  } catch {
    throw new AtsError('unreachable')
  }
  if (response.status === 401) throw new AtsError('bad-key')
  if (response.status === 403) throw new AtsError('no-permission')
  if (!response.ok) {
    throw new AtsError('rejected', `${response.status}`)
  }
  if (response.status === 204) return undefined as T
  return (await response.json().catch(() => ({}))) as T
}

const idOf = (value: unknown): string | null => {
  const v = value as { id?: unknown; data?: { id?: unknown } } | null
  const id = v?.id ?? v?.data?.id
  return id === undefined || id === null ? null : String(id)
}

class Greenhouse implements AtsClient {
  readonly ats = 'greenhouse' as const
  private token: { value: string; expiresAt: number } | null = null

  constructor(
    private readonly credential: Extract<AtsCredential, { ats: 'greenhouse' }>,
    private readonly fetcher: Fetch,
    private readonly now: () => number,
  ) {}

  private async bearer(): Promise<string> {
    if (this.token && this.token.expiresAt > this.now() + 60_000)
      return this.token.value
    const body = new URLSearchParams({ grant_type: 'client_credentials' })
    if (this.credential.userId) body.set('sub', this.credential.userId)
    const out = await call<{ access_token?: string; expires_in?: number }>(
      this.fetcher,
      'https://auth.greenhouse.io/token',
      {
        method: 'POST',
        headers: {
          authorization: basic(
            this.credential.clientId,
            this.credential.clientSecret,
          ),
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      },
    )
    if (!out.access_token) throw new AtsError('bad-key')
    this.token = {
      value: out.access_token,
      expiresAt: this.now() + (out.expires_in ?? 3600) * 1000,
    }
    return this.token.value
  }

  private async api<T>(path: string, init: RequestInit = {}): Promise<T> {
    return call<T>(this.fetcher, `https://harvest.greenhouse.io/v3${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${await this.bearer()}`,
        'content-type': 'application/json',
      },
    })
  }

  async verify(): Promise<AtsCredential> {
    await this.bearer()
    return this.credential
  }

  /** Harvest v3 lists need a Site Admin and filter by id, not email: a person is found by the id we saved. */
  async find(): Promise<string | null> {
    return null
  }

  async addProspect(person: AtsPerson): Promise<string> {
    const { first, last } = splitName(person.name)
    const out = await this.api<unknown>('/candidates', {
      method: 'POST',
      body: JSON.stringify({
        first_name: first,
        last_name: last,
        ...(person.headline ? { title: person.headline.slice(0, 255) } : {}),
        ...(person.email
          ? { email_addresses: [{ value: person.email, type: 'other' }] }
          : {}),
        website_addresses: [{ value: person.profileUrl, type: 'other' }],
        application: { prospect: true },
      }),
    })
    const id = idOf(out)
    if (!id) throw new AtsError('rejected', 'no candidate id')
    return id
  }

  async addNote(candidateId: string, note: string): Promise<void> {
    await this.api('/notes', {
      method: 'POST',
      body: JSON.stringify({
        candidate_id: Number(candidateId),
        body: note,
        note_type: 'NOTE',
        visibility: 'public',
      }),
    })
  }
}

class Lever implements AtsClient {
  readonly ats = 'lever' as const

  constructor(
    private readonly credential: Extract<AtsCredential, { ats: 'lever' }>,
    private readonly fetcher: Fetch,
  ) {}

  private api<T>(path: string, init: RequestInit = {}): Promise<T> {
    return call<T>(this.fetcher, `https://api.lever.co/v1${path}`, {
      ...init,
      headers: {
        authorization: basic(this.credential.key),
        'content-type': 'application/json',
      },
    })
  }

  async verify(): Promise<AtsCredential> {
    const out = await this.api<{ data?: Array<{ id: string }> }>(
      `/users?email=${encodeURIComponent(this.credential.email.trim())}`,
    )
    const userId = out.data?.[0]?.id
    if (!userId) throw new AtsError('no-user')
    return { ...this.credential, userId }
  }

  async find(person: AtsPerson): Promise<string | null> {
    if (!person.email) return null
    const out = await this.api<{ data?: Array<{ id: string }> }>(
      `/opportunities?email=${encodeURIComponent(person.email)}&archived=false`,
    )
    return out.data?.[0]?.id ?? null
  }

  async addProspect(person: AtsPerson): Promise<string> {
    if (!this.credential.userId) throw new AtsError('no-user')
    const out = await this.api<unknown>(
      `/opportunities?perform_as=${encodeURIComponent(this.credential.userId)}`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: person.name,
          ...(person.headline ? { headline: person.headline } : {}),
          ...(person.email ? { emails: [person.email] } : {}),
          links: [person.profileUrl],
          origin: 'sourced',
        }),
      },
    )
    const id = idOf(out)
    if (!id) throw new AtsError('rejected', 'no opportunity id')
    return id
  }

  async addNote(candidateId: string, note: string): Promise<void> {
    const as = this.credential.userId
      ? `?perform_as=${encodeURIComponent(this.credential.userId)}`
      : ''
    await this.api(
      `/opportunities/${encodeURIComponent(candidateId)}/notes${as}`,
      {
        method: 'POST',
        body: JSON.stringify({ value: note }),
      },
    )
  }
}

class Ashby implements AtsClient {
  readonly ats = 'ashby' as const

  constructor(
    private readonly credential: Extract<AtsCredential, { ats: 'ashby' }>,
    private readonly fetcher: Fetch,
  ) {}

  /** Every Ashby endpoint is a POST of JSON, answering `{ success, results }`. */
  private async rpc<T>(method: string, body: unknown = {}): Promise<T> {
    const out = await call<{
      success?: boolean
      results?: T
      errors?: unknown
    }>(this.fetcher, `https://api.ashbyhq.com/${method}`, {
      method: 'POST',
      headers: {
        authorization: basic(this.credential.key),
        'content-type': 'application/json',
        accept: 'application/json; version=1',
      },
      body: JSON.stringify(body),
    })
    if (out.success === false) throw new AtsError('rejected', method)
    return out.results as T
  }

  async verify(): Promise<AtsCredential> {
    await this.rpc('apiKey.info')
    return this.credential
  }

  async find(person: AtsPerson): Promise<string | null> {
    if (!person.email) return null
    const found = await this.rpc<Array<{ id: string }>>('candidate.search', {
      email: person.email,
    })
    return found?.[0]?.id ?? null
  }

  async addProspect(person: AtsPerson): Promise<string> {
    const linkedIn = /linkedin\.com\//i.test(person.profileUrl)
    const out = await this.rpc<{ id?: string }>('candidate.create', {
      name: person.name,
      ...(person.email ? { email: person.email } : {}),
      ...(linkedIn
        ? { linkedInUrl: person.profileUrl }
        : { website: person.profileUrl }),
    })
    if (!out?.id) throw new AtsError('rejected', 'no candidate id')
    return out.id
  }

  async addNote(candidateId: string, note: string): Promise<void> {
    await this.rpc('candidate.createNote', {
      candidateId,
      note,
      sendNotifications: false,
    })
  }
}

export function atsClient(
  credential: AtsCredential,
  options: { fetch?: Fetch; now?: () => number } = {},
): AtsClient {
  const fetcher = options.fetch ?? ((url, init) => fetch(url, init))
  switch (credential.ats) {
    case 'greenhouse':
      return new Greenhouse(credential, fetcher, options.now ?? Date.now)
    case 'lever':
      return new Lever(credential, fetcher)
    case 'ashby':
      return new Ashby(credential, fetcher)
  }
}
