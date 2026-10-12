/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { t, tNodes } from '@browseros/i18n'
import { ChevronRight, Lightbulb } from '@browseros/icons'
import { zodResolver } from '@hookform/resolvers/zod'
import type { FC } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod/v3'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

const formSchema = z.object({
  name: z.string().min(1, 'Server name is required'),
  url: z.string().url('Please enter a valid URL'),
  description: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

export interface AddCustomMCPDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddServer: (config: {
    name: string
    url: string
    description: string
  }) => void
}

export const AddCustomMCPDialog: FC<AddCustomMCPDialogProps> = ({
  open,
  onOpenChange,
  onAddServer,
}) => {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      url: '',
      description: '',
    },
  })

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      form.reset()
    }
    onOpenChange(isOpen)
  }

  const onSubmit = (values: FormValues) => {
    onAddServer({
      name: values.name,
      url: values.url,
      description: values.description ?? '',
    })
    form.reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('stAddCustomApp')}</DialogTitle>
          <DialogDescription>
            {t('stConfigureYourCustomAppConnection')}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('stServerName')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('stMyCustomApp')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('stMcpServerUrl')}</FormLabel>
                  <FormDescription>{t('stOnlySupportsHttp')}</FormDescription>
                  <FormControl>
                    <Input
                      type="url"
                      // i18n-ignore: a sample URL
                      placeholder="http://mcp.example.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('stDescriptionOptional')}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t('stDescribeWhatThisServerDoes')}
                      rows={3}
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Collapsible>
              <CollapsibleTrigger className="group flex w-full cursor-pointer items-center gap-2 rounded-md border border-[var(--accent-brand)]/30 bg-[var(--accent-brand)]/5 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--accent-brand)]/10">
                <Lightbulb className="h-4 w-4 shrink-0 text-[var(--accent-brand-ink)]" />
                <span className="flex-1 font-medium">
                  {t('stHowDoIFindThe')}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-90" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 rounded-md border border-[var(--accent-brand)]/30 bg-[var(--accent-brand)]/5 px-3 py-2 text-muted-foreground text-sm">
                {tNodes(
                  'stFindMcpUrl',
                  <code
                    key="a"
                    className="inline rounded bg-muted px-1 text-xs"
                  >
                    http://
                  </code>,
                )}
              </CollapsibleContent>
            </Collapsible>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                {t('stCancel')}
              </Button>
              <Button
                type="submit"
                className="bg-[var(--accent-brand)] text-white hover:bg-[var(--accent-brand-bright)]"
              >
                {t('stAddServer')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
