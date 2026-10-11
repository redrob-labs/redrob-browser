/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { usableAnswer } from './answers'
import type { JobPosting } from './posting'
import type { ApplyMode, JobProfile } from './profile'

/** The message that starts one application. Model input, not copy. */
export function applyPrompt(
  posting: JobPosting,
  profile: JobProfile,
  options: { mode: ApplyMode; resumePath?: string },
): string {
  const answers = profile.answers
    .map((a) => ({ q: a.question, v: usableAnswer(a) }))
    .filter((a): a is { q: string; v: string } => a.v !== null)
  const lines = [
    `Apply for "${posting.title}" at ${posting.company}: ${posting.url}`,
    '',
    'Fill the application with my answers below and nothing else. If a required question is not answered below, do not guess, invent or paraphrase an answer: stop, and tell me the exact question.',
    'Never pay a fee, never create an account with a password I have not given you, and never answer a question about health, family or religion.',
  ]
  if (options.resumePath) {
    lines.push(
      `My résumé is the file ${options.resumePath}: upload it where the form asks for a résumé or CV.`,
    )
  } else {
    lines.push(
      'I have not added a résumé: if the form requires one, stop and tell me.',
    )
  }
  lines.push('', 'My answers:')
  for (const a of answers) lines.push(`- ${a.q}: ${a.v}`)
  lines.push('')
  lines.push(
    options.mode === 'review'
      ? 'When every field is filled, stop before the final submit button: tell me what you filled and that I can review and submit it myself.'
      : 'When every field is filled and every required question is answered from my answers, submit the application. If anything is uncertain, stop instead.',
  )
  lines.push(
    'If the site asks me to sign in, or shows a captcha, stop and tell me.',
  )
  return lines.join('\n')
}
