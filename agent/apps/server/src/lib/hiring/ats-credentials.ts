/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * ATS connection keys, in the server's credential store (`oauth_tokens`) on this device, as the
 * Recruit plan §4.4 says. Never sent to the extension: the routes answer only "connected".
 */

import type { ConnectableAts } from '@browseros/hiring/ats'
import type { AtsCredentialStore } from '../../api/services/hiring-ats'
import { OAuthTokenStore } from '../clients/oauth/token-store'
import type { BrowserOsDatabase } from '../db'
import type { AtsCredential } from './ats-clients'

const provider = (ats: ConnectableAts) => `hiring-ats:${ats}`

export function atsCredentialStore(
  db: () => BrowserOsDatabase,
  browserosId: string,
): AtsCredentialStore {
  const tokens = () => new OAuthTokenStore(db())
  return {
    get(ats) {
      const row = tokens().getTokens(browserosId, provider(ats))
      if (!row) return null
      try {
        const credential = JSON.parse(row.accessToken) as AtsCredential
        return credential.ats === ats ? credential : null
      } catch {
        return null
      }
    },
    set(credential) {
      tokens().upsertTokens(browserosId, provider(credential.ats), {
        accessToken: JSON.stringify(credential),
        refreshToken: '',
        expiresAt: 0,
      })
    },
    delete(ats) {
      tokens().deleteTokens(browserosId, provider(ats))
    },
  }
}
