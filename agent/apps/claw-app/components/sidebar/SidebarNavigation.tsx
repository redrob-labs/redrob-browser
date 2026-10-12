/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { LayoutDashboard, PlugZap, Repeat, ScrollText } from '@browseros/icons'
import type { ComponentType, SVGProps } from 'react'
import { NavLink, useLocation } from 'react-router'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export interface SidebarNavigationProps {
  expanded?: boolean
}

interface NavItem {
  name: string
  to: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
}

const navItems: NavItem[] = [
  { name: 'Cockpit', to: '/', icon: LayoutDashboard },
  { name: 'MCP', to: '/mcp', icon: PlugZap },
  { name: 'Skills', to: '/skills', icon: Repeat },
  { name: 'Audit', to: '/audit', icon: ScrollText },
]

function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.to === '/') return pathname === '/'
  return pathname.startsWith(item.to)
}

export function SidebarNavigation({ expanded = true }: SidebarNavigationProps) {
  const location = useLocation()

  return (
    <nav className="flex-1 overflow-y-auto overflow-x-hidden p-2">
      <div className="space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = isNavItemActive(item, location.pathname)

          const navLink = (
            <NavLink
              to={item.to}
              className={cn(
                'ui-shell-link flex h-9 items-center gap-3 overflow-hidden whitespace-nowrap px-2.5',
                isActive && 'active',
              )}
            >
              <Icon className="size-5 shrink-0" />
              <span
                className={cn(
                  'truncate transition-opacity duration-200',
                  expanded ? 'opacity-100' : 'opacity-0',
                )}
              >
                {item.name}
              </span>
            </NavLink>
          )

          if (!expanded) {
            return (
              <Tooltip key={item.to}>
                <TooltipTrigger render={navLink} />
                <TooltipContent side="right">{item.name}</TooltipContent>
              </Tooltip>
            )
          }

          return <div key={item.to}>{navLink}</div>
        })}
      </div>
    </nav>
  )
}
