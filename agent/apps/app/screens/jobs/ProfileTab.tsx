/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The job seeker's profile: résumé, answer bank, what they are looking for, and how Redrob applies.
 * Edited as a draft and saved once, so a half-typed answer is never what a form receives.
 */

import { t } from '@browseros/i18n'
import { FileText, Plus, Trash2, Upload } from '@browseros/icons'
import {
  type Answer,
  type Criterion,
  type JobProfile,
  VOLUNTARY,
} from '@browseros/jobs/profile'
import { type FC, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ApplyModePicker } from '@/components/jobs/ApplyModePicker'
import { Input } from '@/components/ui/input'
import { useJobActions } from '@/modules/jobs/jobs.hooks'
import { questionLabel } from '@/modules/jobs/labels'

type Draft = Omit<JobProfile, 'version' | 'resume'>

const id = () => crypto.randomUUID().slice(0, 8)
const words = (s: string) =>
  s
    .split(/[,，、]/)
    .map((w) => w.trim())
    .filter(Boolean)

function bytes(n: number): string {
  return n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`
}

export const ProfileTab: FC<{ profile: JobProfile }> = ({ profile }) => {
  const actions = useJobActions()
  const [draft, setDraft] = useState<Draft>(profile)
  const file = useRef<HTMLInputElement>(null)
  useEffect(() => setDraft(profile), [profile])

  const setAnswer = (index: number, patch: Partial<Answer>) =>
    setDraft((d) => ({
      ...d,
      answers: d.answers.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    }))
  const setCriterion = (index: number, patch: Partial<Criterion>) =>
    setDraft((d) => ({
      ...d,
      criteria: d.criteria.map((c, i) =>
        i === index ? { ...c, ...patch } : c,
      ),
    }))

  return (
    <form
      className="space-y-8"
      onSubmit={(event) => {
        event.preventDefault()
        const clean: Draft = {
          ...draft,
          answers: draft.answers.filter((a) => a.question.trim()),
          criteria: draft.criteria.filter((c) => c.text.trim()),
        }
        actions.saveProfile.mutate(clean, {
          onSuccess: () => toast.success(t('jobsSaved')),
        })
      }}
    >
      <section className="space-y-3">
        <h2 className="font-semibold text-[15px]">{t('jobsResume')}</h2>
        <div className="rr-card flex items-center justify-between gap-3 p-4">
          <span className="flex min-w-0 items-center gap-3">
            <FileText className="size-5 shrink-0 text-[var(--text-secondary)]" />
            <span className="min-w-0">
              {profile.resume ? (
                <>
                  <span className="block truncate font-medium text-[14px]">
                    {profile.resume.name}
                  </span>
                  <span className="block text-[12px] text-[var(--text-tertiary)]">
                    {bytes(profile.resume.size)}
                  </span>
                </>
              ) : (
                <span className="block text-[13px] text-[var(--text-secondary)]">
                  {t('jobsResumeHint')}
                </span>
              )}
            </span>
          </span>
          <span className="flex shrink-0 gap-1">
            {profile.resume ? (
              <button
                type="button"
                className="rr-btn rr-btn--ghost rr-btn--sm"
                onClick={() => actions.removeResume.mutate()}
              >
                {t('jobsResumeRemove')}
              </button>
            ) : null}
            <button
              type="button"
              className="rr-btn rr-btn--secondary rr-btn--sm"
              onClick={() => file.current?.click()}
            >
              <Upload className="size-[14px]" />
              {profile.resume ? t('jobsResumeReplace') : t('jobsResumeAdd')}
            </button>
          </span>
          <input
            ref={file}
            type="file"
            hidden
            accept=".pdf,.doc,.docx,.txt"
            onChange={(event) => {
              const chosen = event.target.files?.[0]
              event.target.value = ''
              if (chosen)
                actions.uploadResume.mutate(chosen, {
                  onError: (error) =>
                    toast.error(t('jobsResumeFailed', error.message)),
                })
            }}
          />
        </div>
        {profile.resume ? (
          <p className="text-[12px] text-[var(--text-tertiary)]">
            {t('jobsResumeHint')}
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="font-semibold text-[15px]">{t('jobsAnswers')}</h2>
          <p className="text-[13px] text-[var(--text-secondary)]">
            {t('jobsAnswersHint')}
          </p>
        </div>
        <ul className="space-y-3">
          {draft.answers.map((answer, index) => {
            // Questions the person added are editable; the starter ones are labels in their language.
            const custom = answer.id.startsWith('q-')
            return (
              <li key={answer.id} className="space-y-1">
                {!custom ? (
                  <label
                    htmlFor={`answer-${answer.id}`}
                    className="block font-medium text-[13px]"
                  >
                    {questionLabel(answer)}
                  </label>
                ) : (
                  <Input
                    aria-label={t('jobsAnswerQuestion')}
                    placeholder={t('jobsAnswerQuestion')}
                    value={answer.question}
                    onChange={(e) =>
                      setAnswer(index, { question: e.target.value })
                    }
                  />
                )}
                <span className="flex items-center gap-2">
                  <Input
                    id={`answer-${answer.id}`}
                    placeholder={t('jobsAnswerValue')}
                    value={answer.answer}
                    onChange={(e) =>
                      setAnswer(index, { answer: e.target.value })
                    }
                  />
                  {custom ? (
                    <button
                      type="button"
                      className="rr-iconbtn rr-iconbtn--sm"
                      aria-label={t('jobsRemove')}
                      title={t('jobsRemove')}
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          answers: d.answers.filter((_, i) => i !== index),
                        }))
                      }
                    >
                      <Trash2 className="size-[14px]" />
                    </button>
                  ) : null}
                </span>
                {VOLUNTARY.has(answer.id) ? (
                  <span className="block text-[12px] text-[var(--text-tertiary)]">
                    {t('jobsVoluntaryHint')}
                  </span>
                ) : null}
              </li>
            )
          })}
        </ul>
        <button
          type="button"
          className="rr-btn rr-btn--ghost rr-btn--sm"
          onClick={() =>
            setDraft((d) => ({
              ...d,
              answers: [
                ...d.answers,
                { id: `q-${id()}`, question: '', aliases: [], answer: '' },
              ],
            }))
          }
        >
          <Plus className="size-[14px]" />
          {t('jobsAnswerAdd')}
        </button>
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="font-semibold text-[15px]">{t('jobsCriteria')}</h2>
          <p className="text-[13px] text-[var(--text-secondary)]">
            {t('jobsCriteriaHint')}
          </p>
        </div>
        <ul className="space-y-3">
          {draft.criteria.map((criterion, index) => (
            <li key={criterion.id} className="rr-card space-y-2 p-3">
              <span className="flex items-center gap-2">
                <Input
                  aria-label={t('jobsCriterionText')}
                  placeholder={t('jobsCriterionText')}
                  value={criterion.text}
                  onChange={(e) =>
                    setCriterion(index, { text: e.target.value })
                  }
                />
                <div
                  className="rr-seg shrink-0"
                  role="radiogroup"
                  aria-label={t('jobsCriteria')}
                >
                  {(['must', 'nice'] as const).map((kind) => (
                    // biome-ignore lint/a11y/useSemanticElements: .rr-seg is the design system's segmented control, styled on button[aria-checked]
                    <button
                      key={kind}
                      type="button"
                      role="radio"
                      aria-checked={criterion.kind === kind}
                      onClick={() => setCriterion(index, { kind })}
                    >
                      {kind === 'must' ? t('jobsMust') : t('jobsNice')}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="rr-iconbtn rr-iconbtn--sm"
                  aria-label={t('jobsRemove')}
                  title={t('jobsRemove')}
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      criteria: d.criteria.filter((_, i) => i !== index),
                    }))
                  }
                >
                  <Trash2 className="size-[14px]" />
                </button>
              </span>
              <Input
                aria-label={t('jobsCriterionKeywords')}
                placeholder={t('jobsCriterionKeywords')}
                value={criterion.keywords.join(', ')}
                onChange={(e) =>
                  setCriterion(index, { keywords: words(e.target.value) })
                }
              />
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="rr-btn rr-btn--ghost rr-btn--sm"
          onClick={() =>
            setDraft((d) => ({
              ...d,
              criteria: [
                ...d.criteria,
                { id: `c-${id()}`, text: '', kind: 'must', keywords: [] },
              ],
            }))
          }
        >
          <Plus className="size-[14px]" />
          {t('jobsCriterionAdd')}
        </button>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-[15px]">{t('jobsModeLabel')}</h2>
        <ApplyModePicker
          value={draft.mode}
          dailyCap={draft.dailyCap}
          onChange={(mode) => setDraft((d) => ({ ...d, mode }))}
        />
        {draft.mode === 'automatic' ? (
          <span className="flex items-center gap-3 text-[13px]">
            <label htmlFor="jobs-daily-cap">{t('jobsDailyCapLabel')}</label>
            <Input
              id="jobs-daily-cap"
              type="number"
              min={1}
              max={50}
              className="w-20"
              value={draft.dailyCap}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  dailyCap: Math.min(
                    50,
                    Math.max(1, Number(e.target.value) || 1),
                  ),
                }))
              }
            />
          </span>
        ) : null}
        <span className="block space-y-1 text-[13px]">
          <label htmlFor="jobs-keywords" className="block font-medium">
            {t('jobsKeywords')}
          </label>
          <Input
            id="jobs-keywords"
            placeholder={t('jobsKeywordsPlaceholder')}
            value={draft.keywords}
            onChange={(e) =>
              setDraft((d) => ({ ...d, keywords: e.target.value }))
            }
          />
        </span>
      </section>

      <footer className="sticky bottom-0 flex justify-end bg-[var(--surface-base)] py-3">
        <button
          type="submit"
          className="rr-btn rr-btn--primary"
          disabled={actions.saveProfile.isPending}
        >
          {t('jobsSave')}
        </button>
      </footer>
    </form>
  )
}
