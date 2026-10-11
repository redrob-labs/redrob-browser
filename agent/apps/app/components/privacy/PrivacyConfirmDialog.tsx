/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { getLocale, t } from '@browseros/i18n'
import type { LabelCategory } from '@browseros/privacy/labels'
import type { FC } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { kindsList } from '@/modules/privacy/privacy-copy'

export interface PrivacyConfirmRequest {
  count: number
  kinds: LabelCategory[]
}

/**
 * At Strict, before Send: how many details will be hidden, and which kinds. Edit and Send are the
 * same size, so saying no is never the harder of the two (the design system's ApprovalStep rule).
 */
export const PrivacyConfirmDialog: FC<{
  request: PrivacyConfirmRequest | null
  onEdit: () => void
  onSend: () => void
}> = ({ request, onEdit, onSend }) => (
  <AlertDialog
    open={request !== null}
    onOpenChange={(open) => !open && onEdit()}
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {request?.count === 1
            ? t('privacyConfirmTitleOne')
            : t('privacyConfirmTitleOther', request?.count ?? 0)}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {t(
            'privacyConfirmText',
            kindsList(request?.kinds ?? [], getLocale()),
          )}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel onClick={onEdit}>
          {t('privacyConfirmEdit')}
        </AlertDialogCancel>
        <AlertDialogAction onClick={onSend}>
          {t('privacyConfirmSend')}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)
