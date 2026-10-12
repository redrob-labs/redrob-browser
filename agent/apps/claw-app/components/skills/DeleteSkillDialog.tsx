/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { t } from '@browseros/i18n'
import { useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useDeleteSkill, useSkills } from '@/modules/api/skills.hooks'

interface DeleteSkillDialogProps {
  name: string
  onDeleted: () => void
  trigger?: ReactElement
}

export function DeleteSkillDialog({
  name,
  onDeleted,
  trigger,
}: DeleteSkillDialogProps) {
  const queryClient = useQueryClient()
  const remove = useDeleteSkill()

  const onConfirm = () => {
    void toast.promise(
      remove.mutateAsync({ name }).then(() => {
        void queryClient.invalidateQueries({ queryKey: useSkills.getKey() })
        onDeleted()
      }),
      {
        loading: `Deleting ${name}…`,
        success: `Deleted ${name}`,
        error: t('clCouldNotDeleteSkill'),
      },
    )
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          trigger ?? (
            <Button variant="outline" size="sm" className="rounded-9 text-red">
              {t('clDelete')}
            </Button>
          )
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('clDeleteThisSkill')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('clDeleteSkillDesc', name)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('clCancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {t('clDeleteSkill')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
