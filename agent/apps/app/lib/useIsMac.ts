/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { useEffect, useState } from 'react'

/**
 * @public
 */
export const useIsMac = (): boolean | undefined => {
  const [isMac, setIsMac] = useState<boolean | undefined>(undefined)

  useEffect(() => {
    setIsMac(navigator.platform.toUpperCase().indexOf('MAC') >= 0)
  }, [])

  return isMac
}
