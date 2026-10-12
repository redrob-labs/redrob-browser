/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { CalendarClock, Home, PlugZap, Settings } from '@browseros/icons'
import type { FC } from 'react'
import { NavLink, useLocation } from 'react-router'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { SidebarHistory } from './SidebarHistory'

export interface SidebarNavigationProps {
  expanded?: boolean
  onNavigate?: () => void
}

type NavItem = {
  name: string
  to: string
  icon: typeof Home
}

const primaryNavItems: NavItem[] = [
  { name: 'Home', to: '/home', icon: Home },
  {
    name: 'Connect Apps',
    to: '/connect-apps',
    icon: PlugZap,
  },
  { name: 'Scheduled Tasks', to: '/scheduled', icon: CalendarClock },
  {
    name: 'Settings',
    to: '/settings/ai',
    icon: Settings,
  },
]

function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.to === '/settings/ai') {
    return pathname.startsWith('/settings')
  }

  return pathname === item.to
}

export const SidebarNavigation: FC<SidebarNavigationProps> = ({
  expanded = true,
  onNavigate,
}) => {
  const location = useLocation()

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2">
        <nav className="space-y-1">
          {primaryNavItems.map((item) => {
            const Icon = item.icon
            const _isActive = isNavItemActive(item, location.pathname)

            const navItem = (
              <NavLink
                to={item.to}
                onClick={onNavigate}
                className={cn(
                  'ui-shell-link flex h-9 items-center gap-2 overflow-hidden whitespace-nowrap px-3',
                )}
              >
                <Icon className="size-4 shrink-0" />
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

            return (
              <div key={item.to}>
                {/* Expansion unmounts the content, so the trigger must own closing on pointer leave. */}
                <Tooltip disableHoverableContent>
                  <TooltipTrigger asChild>{navItem}</TooltipTrigger>
                  {!expanded && (
                    <TooltipContent side="right">{item.name}</TooltipContent>
                  )}
                </Tooltip>
                {item.to === '/home' && (
                  <SidebarHistory expanded={expanded} onNavigate={onNavigate} />
                )}
              </div>
            )
          })}
        </nav>
      </div>
    </TooltipProvider>
  )
}
