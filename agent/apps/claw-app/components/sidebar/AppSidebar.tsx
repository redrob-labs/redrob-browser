/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { cn } from '@/lib/utils'
import { SidebarBranding } from './SidebarBranding'
import { SidebarHelp } from './SidebarHelp'
import { SidebarNavigation } from './SidebarNavigation'
import { SidebarPrivacy } from './SidebarPrivacy'
import { SidebarThemeToggle } from './SidebarThemeToggle'

export interface AppSidebarProps {
  expanded?: boolean
}

/**
 * Sidebar shell: branding, primary navigation, the theme control and the
 * privacy row, and a bottom help footer. Theme sits above privacy rather
 * than inside SidebarHelp's bordered strip — it is a preference, not help.
 */
export function AppSidebar({ expanded = false }: AppSidebarProps) {
  return (
    <div
      className={cn(
        'ui-shell-side flex h-full flex-col transition-all duration-200 ease-in-out',
        expanded ? 'w-64' : 'w-14',
      )}
    >
      <SidebarBranding expanded={expanded} />
      <SidebarNavigation expanded={expanded} />
      <div className="px-2 pb-1">
        <SidebarThemeToggle expanded={expanded} />
      </div>
      <div className="px-2 pb-1">
        <SidebarPrivacy expanded={expanded} />
      </div>
      <SidebarHelp expanded={expanded} />
    </div>
  )
}
