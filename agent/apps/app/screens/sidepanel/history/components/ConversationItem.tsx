/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
 * See the NOTICE file for provenance.
 */

import { formatRelative, t } from '@browseros/i18n'
import { MessageSquare, Trash2 } from '@browseros/icons'
import { type FC, useState } from 'react'
import { Link } from 'react-router'
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
import type { HistoryConversation } from './types'

export interface ConversationItemProps {
  conversation: HistoryConversation
  onDelete?: (id: string) => void
  isActive: boolean
}

export const ConversationItem: FC<ConversationItemProps> = ({
  conversation,
  onDelete,
  isActive,
}) => {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const label = conversation.lastUserMessage
  const relativeTimeAgo = formatRelative(conversation.lastMessagedAt)

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setShowDeleteDialog(true)
  }

  const handleConfirmDelete = () => {
    onDelete?.(conversation.id)
    setShowDeleteDialog(false)
  }

  return (
    <>
      {/* The row is a ground; the link and the delete button are siblings inside it, because an
          interactive element nested in an <a> is invalid and leaves the button without a focus target. */}
      <div
        className="ui-panel-row group flex w-full items-start gap-1"
        aria-current={isActive ? 'page' : undefined}
      >
        <Link
          to={`/?conversationId=${conversation.id}`}
          aria-current={isActive ? 'page' : undefined}
          className="ui-panel-row__link flex min-w-0 flex-1 items-start gap-3 px-3 py-2.5"
        >
          <MessageSquare className="ui-panel-row__icon mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="ui-panel-row__title truncate">{label}</p>
            <p className="ui-panel-row__meta">{relativeTimeAgo}</p>
          </div>
        </Link>
        {onDelete && (
          <button
            type="button"
            onClick={handleDeleteClick}
            className="ui-panel-row__action rr-iconbtn rr-iconbtn--sm mt-1.5 mr-1.5 shrink-0"
            title={t('spDeleteConversation')}
            aria-label={t('spDeleteConversation')}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('spDeleteConversationQ')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('spDeleteConversationDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('spCancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              variant="destructive"
            >
              {t('spDelete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
