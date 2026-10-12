/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { t, tNodes } from '@browseros/i18n'
import { Plus, Trash2 } from '@browseros/icons'
import { CONVERSATION_ID_PLACEHOLDER } from '@browseros/shared/schemas/llm'
import { useFieldArray, useFormContext } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import type { ProviderFormValues } from './provider-form-schema'

export function ProviderHeadersFields() {
  const form = useFormContext<ProviderFormValues>()
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'headers',
  })

  return (
    <fieldset className="space-y-3">
      <legend className="font-medium text-sm">{t('stCustomHeaders')}</legend>
      <p className="text-muted-foreground text-xs">
        {tNodes(
          'stHeadersHelp',
          <code key="a">{CONVERSATION_ID_PLACEHOLDER}</code>,
        )}
      </p>
      {fields.map((header, index) => (
        <div key={header.id} className="space-y-2">
          <div className="flex items-start gap-2">
            <FormField
              control={form.control}
              name={`headers.${index}.name`}
              render={({ field }) => (
                <FormItem className="min-w-0 flex-1">
                  <FormLabel>{t('stHeaderName')}</FormLabel>
                  <FormControl>
                    {/* i18n-ignore: a sample header name */}
                    <Input placeholder="X-Custom-Header" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`headers.${index}.value`}
              render={({ field }) => (
                <FormItem className="min-w-0 flex-1">
                  <FormLabel>{t('stHeaderValue')}</FormLabel>
                  <FormControl>
                    {/* i18n-ignore: a sample value */}
                    <Input autoComplete="off" placeholder="value" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mt-6"
              aria-label={t('stRemoveHeaderN', index + 1)}
              onClick={() => remove(index)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0"
            onClick={() =>
              form.setValue(
                `headers.${index}.value`,
                CONVERSATION_ID_PLACEHOLDER,
                { shouldDirty: true, shouldValidate: true },
              )
            }
          >
            {t('stUseConversationId')}
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => append({ name: '', value: '' })}
      >
        <Plus className="mr-2 size-4" />
        {t('stAddHeader')}
      </Button>
    </fieldset>
  )
}
