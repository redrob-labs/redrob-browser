/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { motion } from 'motion/react'
import type { FC } from 'react'
import ProductLogoSvg from '@/assets/product_logo.svg'

export const NewTabBranding: FC = () => {
  return (
    <div className="space-y-4 text-center">
      <div className="mb-2 flex items-center justify-center gap-3">
        <motion.div
          layoutId="new-tab-branding"
          transition={{
            type: 'keyframes',
            damping: 20,
            stiffness: 300,
          }}
          className="flex h-20 w-20 items-center justify-center rounded-xl bg-transparent"
        >
          <img src={ProductLogoSvg} alt="Redrob" className="h-20 w-20" />
        </motion.div>
      </div>
    </div>
  )
}
