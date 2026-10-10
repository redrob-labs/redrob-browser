/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import {
  Activity,
  ArrowLeft,
  Bot,
  MessageSquare,
  Palette,
  Server,
} from '@browseros/icons'
import type { FC } from 'react'
import { NavLink } from 'react-router'
import { ThemeToggle } from '@/components/elements/theme-toggle'
import type { Feature } from '@/lib/browseros/capabilities'
import { cn } from '@/lib/utils'
import { useCapabilities } from '@/modules/browseros/capabilities.hooks'

type BaseNavItem = {
  name: string
  icon: typeof Bot
  feature?: Feature
}

type InternalNavItem = BaseNavItem & {
  href?: never
  to: string
}

type ExternalNavItem = BaseNavItem & {
  href: string
  to?: never
}

type NavItem = InternalNavItem | ExternalNavItem

type NavSection = {
  label: string
  items: NavItem[]
}

function isExternalNavItem(item: NavItem): item is ExternalNavItem {
  return 'href' in item
}

const getNavLinkClassName = (isActive: boolean) =>
  cn(
    'ui-shell-link flex h-9 items-center gap-2 overflow-hidden whitespace-nowrap px-3',
    isActive && 'active',
  )

const getSectionClassName = (index: number) =>
  cn(index > 0 && 'mt-3 border-[var(--border-subtle)] border-t pt-3')

const sectionLabelClassName = 'ui-shell-label mb-2 px-3'

const primarySettingsSections: NavSection[] = [
  {
    label: 'Provider Settings',
    items: [
      { name: 'AI & Agents', to: '/settings/ai', icon: Bot },
      {
        name: 'Chat & Council Provider',
        to: '/settings/chat',
        icon: MessageSquare,
      },
    ],
  },
  {
    label: 'Other',
    items: [
      {
        name: 'Customize Redrob',
        to: '/settings/customization',
        icon: Palette,
      },
      { name: 'Redrob as MCP', to: '/settings/mcp', icon: Server },
    ],
  },
]

const helpItems: NavItem[] = [
  { name: 'Diagnostics', to: '/settings/diagnostics', icon: Activity },
]

export const SettingsSidebar: FC = () => {
  const { supports } = useCapabilities()

  const filteredSections = primarySettingsSections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.feature || supports(item.feature),
      ),
    }))
    .filter((section) => section.items.length > 0)

  const filteredHelpItems = helpItems.filter(
    (item) => !item.feature || supports(item.feature),
  )

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon

    if (isExternalNavItem(item)) {
      return (
        <a
          key={item.href}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className={getNavLinkClassName(false)}
        >
          <Icon className="size-4 shrink-0" />
          <span className="truncate">{item.name}</span>
        </a>
      )
    }

    return (
      <NavLink
        key={item.to}
        to={item.to}
        end
        className={({ isActive }) => getNavLinkClassName(isActive)}
      >
        <Icon className="size-4 shrink-0" />
        <span className="truncate">{item.name}</span>
      </NavLink>
    )
  }

  const renderSection = (section: NavSection, index: number) => (
    <div key={section.label} className={getSectionClassName(index)}>
      <div className={sectionLabelClassName}>{section.label}</div>
      <nav className="space-y-1">{section.items.map(renderNavItem)}</nav>
    </div>
  )

  return (
    <div className="ui-shell-side flex h-full w-64 flex-col">
      <div className="flex h-14 items-center justify-between border-b px-2">
        <NavLink
          to="/home"
          className="ui-shell-link flex h-9 items-center gap-2 overflow-hidden whitespace-nowrap px-3"
        >
          <ArrowLeft className="size-4 shrink-0" />
          <span className="truncate">Back</span>
        </NavLink>
        <ThemeToggle
          className="mr-1 h-8 w-8 shrink-0"
          iconClassName="h-4 w-4"
        />
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden p-2">
        <div className="ui-shell-label mb-2 px-3">Settings</div>
        <div>{filteredSections.map(renderSection)}</div>
        <div className="mt-auto pt-4">
          <div className={sectionLabelClassName}>Help</div>
          <nav className="space-y-1">
            {filteredHelpItems.map(renderNavItem)}
          </nav>
        </div>
      </div>
    </div>
  )
}
