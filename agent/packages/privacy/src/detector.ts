/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: MIT
 *
 * Ported from Redrob Cowork, apps/server/src/privacy/detector.ts (MIT).
 */

import {
  vocabFromTokenizerJson,
  WordPiece,
  type WordPieceToken,
} from './wordpiece'

/*
 * The privacy detection model: a pretrained token-classification encoder (no fine-tuning; see
 * docs/features/team-and-privacy-service/model-evaluation.md for how candidates were measured) that
 * finds what patterns cannot: people's names, organisations and free-form addresses.
 *
 * It runs on the person's own machine, so the text it reads never leaves it. A model is a manifest,
 * the ONNX file and its tokenizer; both files are checked against the manifest's SHA-256 before
 * anything is loaded, and the manifest itself is pinned by the caller, so a swapped file is refused,
 * not run. Reading and hashing the files is the caller's job: this file has no Node dependency, so
 * the agent server and an extension page can both use it.
 *
 * Without a model the gate keeps working on patterns and listed names alone, and says so.
 */

export type DetectedCategory = 'PERSON' | 'ORG' | 'ADDRESS'

export type DetectedEntity = {
  category: DetectedCategory
  /** UTF-16 offsets into the text that was passed in. */
  start: number
  end: number
  value: string
  /** Mean probability of the entity's tokens, 0-1. */
  score: number
}

export type DetectorManifest = {
  /** Hugging Face id and revision the files came from. */
  id: string
  revision: string
  license: string
  model: { file: string; sha256: string }
  tokenizer: { file: string; sha256: string }
  /** Output label per class index, as in the model's config.json `id2label`. */
  labels: string[]
  /** The model's entity types that map to a category; every other type is ignored. */
  categories: Record<string, DetectedCategory>
  /** Whether the graph takes token_type_ids. Defaults to true (BERT/ELECTRA exports do). */
  tokenTypeIds?: boolean
}

/** The part of onnxruntime's API the detector uses; onnxruntime-node and -web both provide it. */
export type OrtRuntime = {
  InferenceSession: {
    create(
      model: Uint8Array,
      options?: Record<string, unknown>,
    ): Promise<OrtSession>
  }
  Tensor: new (
    type: 'int64',
    data: BigInt64Array,
    dims: readonly number[],
  ) => unknown
}
export type OrtSession = {
  run(
    feeds: Record<string, unknown>,
  ): Promise<Record<string, { data: unknown; dims: readonly number[] }>>
  inputNames: readonly string[]
}

export interface EntityDetector {
  readonly id: string
  detect(text: string): Promise<DetectedEntity[]>
}

export type Tag = { kind: 'B' | 'I' | 'E' | 'S' | 'O'; type: string }

/** `B-NAME`, `I-PERSON`, `E-ORG`, `S-ADDRESS` (BIOES), `PER-B` (suffix form), `O`. */
export function parseTag(label: string): Tag {
  if (label === 'O') return { kind: 'O', type: '' }
  const prefix = /^([BIES])-(.+)$/.exec(label)
  if (prefix) return { kind: prefix[1] as Tag['kind'], type: prefix[2] }
  const suffix = /^(.+)-([BIES])$/.exec(label)
  if (suffix) return { kind: suffix[2] as Tag['kind'], type: suffix[1] }
  return { kind: 'O', type: '' }
}

/**
 * Honorifics and particles that WordPiece splits off a name as `##` pieces and a model sometimes
 * tags as part of it. Only pieces no Korean name ends in: single-syllable particles such as 은 or 이
 * also end real given names (하은, 민이), so for those the model's own tag decides.
 */
const TRAILING_PIECES = new Set([
  '님',
  '씨',
  '께서',
  '께',
  '에게',
  '에서',
  '으로',
  '이다',
  '입니다',
  '이며',
  '이고',
  '측',
  '님은',
  '님의',
  '님이',
  '님께',
])

export type DecodeOptions = { minScore?: number }

type Span = { type: string; first: number; last: number; scores: number[] }

/** Turns per-token predictions into entities. Exported for the tests and the evaluation. */
export function decodeEntities(
  text: string,
  tokens: readonly WordPieceToken[],
  predictions: ReadonlyArray<{ label: number; score: number }>,
  manifest: Pick<DetectorManifest, 'labels' | 'categories'>,
  options: DecodeOptions = {},
): DetectedEntity[] {
  const minScore = options.minScore ?? 0.5
  const entities: DetectedEntity[] = []
  let current: Span | null = null
  /** Inside a word the entity has stopped at a piece the model tagged O; the rest of it stays out. */
  let stoppedInWord = false

  const close = () => {
    if (!current) return
    const category = manifest.categories[current.type]
    let last = current.last
    if (category === 'PERSON' || category === 'ORG') {
      while (
        last > current.first &&
        tokens[last].continuation &&
        TRAILING_PIECES.has(tokens[last].piece.slice(2))
      )
        last -= 1
    }
    const scores = current.scores.slice(0, last - current.first + 1)
    const score = scores.reduce((sum, value) => sum + value, 0) / scores.length
    const start = tokens[current.first].start
    const end = tokens[last].end
    const value = text.slice(start, end)
    if (category && score >= minScore && value.trim().length >= 2)
      entities.push({ category, start, end, value, score })
    current = null
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    const tag = parseTag(manifest.labels[predictions[index].label] ?? 'O')
    const score = predictions[index].score
    if (token.continuation) {
      if (stoppedInWord) continue
      if (current && tag.kind === 'O') {
        // 손하 / ##은 tagged O: the particle after the name. The name ends here.
        close()
        stoppedInWord = true
        continue
      }
      if (current) {
        // A piece inside a word the entity already covers stays with it, whatever its type, so a
        // word is never cut in half (김지 / ##원).
        current.last = index
        current.scores.push(score)
        if (tag.kind === 'E' || tag.kind === 'S') close()
        continue
      }
      // An entity that starts mid-word (㈜ / ##한빛) starts at this piece.
    }
    stoppedInWord = false
    if (tag.kind === 'O') {
      close()
      continue
    }
    const startsNew =
      tag.kind === 'B' ||
      tag.kind === 'S' ||
      !current ||
      current.type !== tag.type
    if (startsNew) {
      close()
      current = { type: tag.type, first: index, last: index, scores: [score] }
    } else if (current) {
      current.last = index
      current.scores.push(score)
    }
    if (tag.kind === 'E' || tag.kind === 'S') close()
  }
  close()
  return refineEntities(text, entities)
}

const EN_LEGAL_FORM = String.raw`(?:Inc|LLC|L\.L\.C|LLP|Ltd|Corp|Corporation|Co|GmbH|PLC|N\.A|S\.A|AG|Limited)\b\.?`
/** `Bluecrest` + ` Capital LLC`: capitalised words up to a legal form, after an entity. */
const EN_ORG_TAIL = new RegExp(
  String.raw`^(?:\s+(?:[A-Z][A-Za-z&'-]*|&))*,?\s+${EN_LEGAL_FORM}`,
)
/** A name ending in a legal form already, so nothing needs adding. */
const EN_ORG_SELF = new RegExp(String.raw`\b${EN_LEGAL_FORM}$`)
const KO_ORG_PREFIX = /(?:주식회사|유한회사|재단법인|사단법인|\(주\)|㈜)\s?$/
const KO_ORG_SUFFIX = /^(?:\s?(?:주식회사|유한회사))/
const ZIP_TAIL = /^,?\s+(?:[A-Z]{2}\s+)?\d{5}(?:-\d{4})?\b/

/**
 * Deterministic boundary fixes after decoding, measured in model-evaluation.md:
 *   - an entity followed by a legal form (`Bluecrest` + ` Capital LLC`) or preceded by a Korean one
 *     (`(주)` + `한빛`) is an organisation, and includes it;
 *   - neighbouring pieces of one address or organisation, split only by commas or spaces
 *     (`8700 Pine Lane,` + `Suite 387, Austin`), are one entity, and an address takes the ZIP code
 *     that ends it.
 * Nothing here finds an entity the model did not; it only completes the ones it did.
 */
export function refineEntities(
  text: string,
  entities: DetectedEntity[],
): DetectedEntity[] {
  const out = entities.map((entity) => ({ ...entity }))
  for (const entity of out) extendLegalForms(text, entity)
  out.sort((a, b) => a.start - b.start)
  const merged = mergeNeighbours(text, out)
  for (const entity of merged) trimEntity(text, entity)
  return merged.filter((entity) => entity.value.length >= 2)
}

/** A legal form before or after an entity makes it an organisation, and joins it. */
function extendLegalForms(text: string, entity: DetectedEntity): void {
  const before = text.slice(Math.max(0, entity.start - 8), entity.start)
  const prefix = KO_ORG_PREFIX.exec(before)
  if (prefix) {
    entity.start -= prefix[0].length
    entity.category = 'ORG'
  }
  const after = text.slice(entity.end, entity.end + 80)
  const tail = EN_ORG_SELF.test(text.slice(entity.start, entity.end))
    ? null
    : EN_ORG_TAIL.exec(after)
  if (tail && /^[A-Z]/.test(text.slice(entity.start, entity.end).trim())) {
    entity.end += tail[0].length
    entity.category = 'ORG'
  } else if (entity.category === 'ORG') {
    const suffix = KO_ORG_SUFFIX.exec(after)
    if (suffix) entity.end += suffix[0].length
  }
}

/** Overlaps after extension, and pieces of one entity split only by commas or spaces, become one. */
function mergeNeighbours(
  text: string,
  sorted: DetectedEntity[],
): DetectedEntity[] {
  const merged: DetectedEntity[] = []
  for (const entity of sorted) {
    const previous = merged[merged.length - 1]
    if (previous && entity.start <= previous.end) {
      // Overlap after extension: keep the wider, prefer an organisation over what it swallowed.
      if (entity.end > previous.end) previous.end = entity.end
      if (entity.category === 'ORG') previous.category = 'ORG'
      previous.score = Math.max(previous.score, entity.score)
      continue
    }
    const gap = previous ? text.slice(previous.end, entity.start) : ''
    if (
      previous &&
      previous.category === entity.category &&
      entity.category !== 'PERSON' &&
      /^[\s,]{0,3}$/.test(gap)
    ) {
      previous.end = entity.end
      previous.score = Math.min(previous.score, entity.score)
      continue
    }
    merged.push(entity)
  }
  return merged
}

/** An address takes the ZIP code that ends it; spaces and commas at either end are dropped. */
function trimEntity(text: string, entity: DetectedEntity): void {
  if (entity.category === 'ADDRESS') {
    const zip = ZIP_TAIL.exec(text.slice(entity.end, entity.end + 16))
    if (zip) entity.end += zip[0].length
  }
  // Leading and trailing spaces or commas are never part of the entity.
  while (entity.start < entity.end && /[\s,]/.test(text[entity.start]))
    entity.start += 1
  while (entity.end > entity.start && /[\s,]/.test(text[entity.end - 1]))
    entity.end -= 1
  entity.value = text.slice(entity.start, entity.end)
}

const WINDOW = 254
const OVERLAP = 32

function softmaxArgmax(
  logits: Float32Array,
  offset: number,
  classes: number,
): { label: number; score: number } {
  let best = 0
  let max = -Infinity
  for (let k = 0; k < classes; k += 1) {
    const value = logits[offset + k]
    if (value > max) {
      max = value
      best = k
    }
  }
  let sum = 0
  for (let k = 0; k < classes; k += 1) sum += Math.exp(logits[offset + k] - max)
  return { label: best, score: 1 / sum }
}

class OnnxDetector implements EntityDetector {
  readonly id: string

  constructor(
    private readonly ort: OrtRuntime,
    private readonly session: OrtSession,
    private readonly tokenizer: WordPiece,
    readonly manifest: DetectorManifest,
    private readonly decode: DecodeOptions,
  ) {
    this.id = `${manifest.id}@${manifest.revision.slice(0, 8)}`
  }

  /** Predictions for every token, in windows the model's position limit allows. */
  async predict(
    tokens: readonly WordPieceToken[],
  ): Promise<Array<{ label: number; score: number }>> {
    const out: Array<{ label: number; score: number }> = new Array(
      tokens.length,
    )
    const cls = this.tokenizer.id('[CLS]')
    const sep = this.tokenizer.id('[SEP]')
    const classes = this.manifest.labels.length
    for (let begin = 0; begin < tokens.length; begin += WINDOW - OVERLAP) {
      const slice = tokens.slice(begin, begin + WINDOW)
      const ids = BigInt64Array.from(
        [cls, ...slice.map((token) => token.id), sep].map(BigInt),
      )
      const dims = [1, ids.length] as const
      const feeds: Record<string, unknown> = {
        input_ids: new this.ort.Tensor('int64', ids, dims),
        attention_mask: new this.ort.Tensor(
          'int64',
          new BigInt64Array(ids.length).fill(1n),
          dims,
        ),
      }
      if (
        this.manifest.tokenTypeIds !== false &&
        this.session.inputNames.includes('token_type_ids')
      ) {
        feeds.token_type_ids = new this.ort.Tensor(
          'int64',
          new BigInt64Array(ids.length),
          dims,
        )
      }
      const result = await this.session.run(feeds)
      const logits = (result.logits ?? Object.values(result)[0])
        .data as Float32Array
      for (let i = 0; i < slice.length; i += 1) {
        // In an overlap the later window wins for its second half, where it has more context.
        const position = begin + i
        if (out[position] && i < OVERLAP / 2) continue
        out[position] = softmaxArgmax(logits, (i + 1) * classes, classes)
      }
      if (begin + WINDOW >= tokens.length) break
    }
    return out
  }

  async detect(text: string): Promise<DetectedEntity[]> {
    if (!text.trim()) return []
    const tokens = this.tokenizer.tokenize(text)
    if (!tokens.length) return []
    return decodeEntities(
      text,
      tokens,
      await this.predict(tokens),
      this.manifest,
      this.decode,
    )
  }
}

export class DetectorIntegrityError extends Error {}

/** Hex SHA-256 of some bytes. Injected so this file runs where `node:crypto` does not. */
export type Sha256 = (bytes: Uint8Array) => string | Promise<string>

/** A model's three files, read by whoever owns the file system. */
export type DetectorFiles = {
  manifest: Uint8Array
  model: Uint8Array
  tokenizer: Uint8Array
}

/**
 * Checks and loads a model from its files. `expectedManifestSha256` pins the manifest itself; when
 * given, a manifest that does not hash to it is refused before its own hashes are trusted.
 */
export async function loadDetector(
  files: DetectorFiles,
  ort: OrtRuntime,
  sha256: Sha256,
  options: {
    expectedManifestSha256?: string
    threads?: number
    decode?: DecodeOptions
  } = {},
): Promise<EntityDetector & { manifest: DetectorManifest }> {
  if (
    options.expectedManifestSha256 &&
    (await sha256(files.manifest)) !== options.expectedManifestSha256
  ) {
    throw new DetectorIntegrityError(
      'privacy model manifest does not match the pinned hash',
    )
  }
  const utf8 = new TextDecoder()
  const manifest = JSON.parse(utf8.decode(files.manifest)) as DetectorManifest
  if ((await sha256(files.model)) !== manifest.model.sha256)
    throw new DetectorIntegrityError(
      'privacy model file does not match its manifest',
    )
  if ((await sha256(files.tokenizer)) !== manifest.tokenizer.sha256)
    throw new DetectorIntegrityError(
      'privacy model tokenizer does not match its manifest',
    )
  const tokenizer = new WordPiece({
    vocab: vocabFromTokenizerJson(JSON.parse(utf8.decode(files.tokenizer))),
  })
  const session = await ort.InferenceSession.create(files.model, {
    executionProviders: ['cpu'],
    graphOptimizationLevel: 'all',
    intraOpNumThreads: options.threads ?? 2,
    interOpNumThreads: 1,
  })
  return new OnnxDetector(
    ort,
    session,
    tokenizer,
    manifest,
    options.decode ?? {},
  )
}
