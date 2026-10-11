/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { Check, ChevronDown, Copy } from '@browseros/icons'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Label } from '@/components/ui/label'
import { MarkdownEditor } from '@/components/ui/MarkdownEditor'
import { usePersonalization } from '@/lib/personalization/personalizationStorage'
import { cn } from '@/lib/utils'
import { NewTabBranding } from '../index/NewTabBranding'
import { templates } from './templates'

const sections = [
  {
    key: 'aboutYou' as const,
    title: 'Add more info about you',
    description: 'Help Redrob understand who you are',
  },
  {
    key: 'expectations' as const,
    title: 'What you expect from the browser',
    description: 'Share your preferences and needs',
  },
  {
    key: 'commonActions' as const,
    title: 'Your commonly performed actions',
    description: 'Describe your daily workflows',
  },
]

export const Personalize = () => {
  const [mounted, setMounted] = useState(false)
  const [expandedSection, setExpandedSection] = useState<string | null>(
    sections[0].key,
  )
  const [copiedSection, setCopiedSection] = useState<string | null>(null)
  const { personalization, setPersonalization } = usePersonalization()

  useEffect(() => {
    setMounted(true)
  }, [])

  const copyTemplate = (templateKey: keyof typeof templates) => {
    const template = templates[templateKey].template
    navigator.clipboard.writeText(template)
    setCopiedSection(templateKey)
    setTimeout(() => setCopiedSection(null), 2000)
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8">
      <NewTabBranding />

      <div
        className={cn(
          'space-y-3 transition-all duration-500',
          mounted ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
        )}
      >
        <Label htmlFor="personalization">Your Information</Label>
        <MarkdownEditor
          id="personalization"
          value={personalization}
          autoFocus
          onChange={setPersonalization}
          placeholder="Tell Redrob about yourself..."
          className="styled-scrollbar h-96 overflow-y-auto"
        />
        <p className="text-muted-foreground text-xs">
          Your information is saved locally and never leaves your device.
          Markdown formatting is supported.
        </p>
      </div>

      <div
        className={cn(
          'space-y-3 transition-all delay-100 duration-500',
          mounted ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
        )}
      >
        <h2 className="ui-meta-label">Need help getting started?</h2>
        <div className="space-y-2">
          {sections.map((section) => (
            <Collapsible
              key={section.key}
              open={expandedSection === section.key}
              onOpenChange={(open) =>
                setExpandedSection(open ? section.key : null)
              }
              className="ui-card w-full"
            >
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  className="ui-card-btn flex w-full items-center justify-between border-transparent! p-4 text-left"
                >
                  <div className="flex-1">
                    <h3 className="mb-1 font-medium text-foreground text-sm">
                      {section.title}
                    </h3>
                    <p className="text-muted-foreground text-xs">
                      {section.description}
                    </p>
                  </div>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 ${expandedSection === section.key ? 'rotate-180' : ''}`}
                  />
                </Button>
              </CollapsibleTrigger>

              <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                <div className="space-y-3 px-4 pb-4">
                  <div>
                    <p className="mb-2 font-medium text-muted-foreground text-xs">
                      Template (click to copy):
                    </p>
                    <div className="relative">
                      <pre className="ui-sample styled-scrollbar overflow-x-auto whitespace-pre-wrap break-words p-4 text-xs">
                        {templates[section.key].template}
                      </pre>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        onClick={() => copyTemplate(section.key)}
                        className="absolute top-3 right-3"
                        title="Copy template"
                      >
                        {copiedSection === section.key ? (
                          <Check className="ui-status--success h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 font-medium text-muted-foreground text-xs">
                      Example:
                    </p>
                    <pre className="ui-sample ui-sample--quiet styled-scrollbar overflow-x-auto whitespace-pre-wrap break-words p-4 text-xs">
                      {templates[section.key].example}
                    </pre>
                  </div>

                  <p className="text-muted-foreground text-xs">
                    Click the copy button to add this template to your
                    clipboard, then paste it into the text area above and
                    customize it.
                  </p>
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      </div>
    </div>
  )
}
