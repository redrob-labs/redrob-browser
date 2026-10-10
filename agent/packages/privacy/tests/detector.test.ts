/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: MIT
 *
 * Ported from Redrob Cowork, apps/server/src/privacy/detector.test.ts, the decoding and loading suites (MIT).
 */

import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'

import {
  type DetectedEntity,
  type DetectorFiles,
  DetectorIntegrityError,
  type DetectorManifest,
  decodeEntities,
  loadDetector,
  type OrtRuntime,
  parseTag,
  refineEntities,
} from '../src/detector'
import { WordPiece } from '../src/wordpiece'
import parity from './fixtures/wordpiece-parity.json' with { type: 'json' }

const bytes = (text: string) => new TextEncoder().encode(text)

const LABELS = ['O', 'B-PS', 'I-PS', 'B-OG', 'I-OG', 'B-LC', 'I-LC']
const MANIFEST: Pick<DetectorManifest, 'labels' | 'categories'> = {
  labels: LABELS,
  categories: { PS: 'PERSON', OG: 'ORG', LC: 'ADDRESS' },
}
const vocab = new Map(Object.entries(parity.vocab as Record<string, number>))
const tokenizer = new WordPiece({ vocab })

/** Tokenizes `text` and tags each token with the label named for its piece (default O). */
function decode(
  text: string,
  tags: string[],
  options?: { minScore?: number; score?: number },
) {
  const tokens = tokenizer.tokenize(text)
  expect(tokens.length).toBe(tags.length)
  const predictions = tags.map((tag) => ({
    label: LABELS.indexOf(tag),
    score: options?.score ?? 0.95,
  }))
  return decodeEntities(text, tokens, predictions, MANIFEST, {
    minScore: options?.minScore,
  })
}

const values = (entities: DetectedEntity[]) =>
  entities.map(({ category, value }) => [category, value])

describe("decoding the model's tags", () => {
  test('tag forms: prefix, suffix and O', () => {
    expect(parseTag('B-PS')).toEqual({ kind: 'B', type: 'PS' })
    expect(parseTag('PER-I')).toEqual({ kind: 'I', type: 'PER' })
    expect(parseTag('S-ADDRESS')).toEqual({ kind: 'S', type: 'ADDRESS' })
    expect(parseTag('O')).toEqual({ kind: 'O', type: '' })
    expect(parseTag('garbage')).toEqual({ kind: 'O', type: '' })
  })

  test('a name keeps its last syllable and drops the honorific and the particle after it', () => {
    // 김지 / ##원 / ##님 / ##은 계약 ##했 ##다 .
    const found = decode('김지원님은 계약했다.', [
      'B-PS',
      'I-PS',
      'I-PS',
      'O',
      'O',
      'O',
      'O',
      'O',
    ])
    expect(values(found)).toEqual([['PERSON', '김지원']])
  })

  test('a piece of a word the name already covers stays with it, whatever the model called it', () => {
    const found = decode('김지원님은 계약했다.', [
      'B-PS',
      'B-OG',
      'O',
      'O',
      'O',
      'O',
      'O',
      'O',
    ])
    expect(values(found)).toEqual([['PERSON', '김지원']])
  })

  test('a word the model stopped tagging stays out, so a particle never joins the next entity', () => {
    // ##원 tagged O ends the name; ##님 tagged as a name again does not start one mid-word.
    const found = decode('김지원님은 계약했다.', [
      'B-PS',
      'O',
      'B-PS',
      'O',
      'O',
      'O',
      'O',
      'O',
    ])
    expect(values(found)).toEqual([['PERSON', '김지']])
  })

  test('entities under the minimum score are dropped', () => {
    expect(
      decode(
        '김지원님은 계약했다.',
        ['B-PS', 'I-PS', 'O', 'O', 'O', 'O', 'O', 'O'],
        { score: 0.4 },
      ),
    ).toEqual([])
    expect(
      decode(
        '김지원님은 계약했다.',
        ['B-PS', 'I-PS', 'O', 'O', 'O', 'O', 'O', 'O'],
        { score: 0.4, minScore: 0.3 },
      ),
    ).toHaveLength(1)
  })

  test('a Korean legal form before an organisation joins it', () => {
    // ( 주 ) 한빛 ...: only 한빛 is tagged.
    const text = '(주)한빛 Bluecrest Capital LLC'
    const tags = tokenizer
      .tokenize(text)
      .map((token) => (token.piece === '한빛' ? 'B-OG' : 'O'))
    expect(values(decode(text, tags))).toEqual([['ORG', '(주)한빛']])
  })
})

describe('boundary fixes after decoding', () => {
  const at = (
    text: string,
    value: string,
    category: DetectedEntity['category'],
  ): DetectedEntity => {
    const start = text.indexOf(value)
    return { category, start, end: start + value.length, value, score: 0.9 }
  }

  test('capitalised words up to an English legal form make an organisation', () => {
    const text = 'Payable to Bluecrest Capital LLC by Friday.'
    expect(
      values(refineEntities(text, [at(text, 'Bluecrest', 'PERSON')])),
    ).toEqual([['ORG', 'Bluecrest Capital LLC']])
    // Already ending in a legal form: nothing added.
    const self = 'Acme Corp, Seoul'
    expect(
      values(refineEntities(self, [at(self, 'Acme Corp', 'ORG')])),
    ).toEqual([['ORG', 'Acme Corp']])
  })

  test('pieces of one address split by commas are one address, with its ZIP code', () => {
    const text = 'Ship to 8700 Pine Lane, Suite 387, Austin, TX 78701 today.'
    const found = refineEntities(text, [
      at(text, '8700 Pine Lane', 'ADDRESS'),
      at(text, 'Suite 387, Austin', 'ADDRESS'),
    ])
    expect(values(found)).toEqual([
      ['ADDRESS', '8700 Pine Lane, Suite 387, Austin, TX 78701'],
    ])
  })

  test('two people next to each other stay two people', () => {
    const text = '김지원, 박서연 참석'
    const found = refineEntities(text, [
      at(text, '김지원', 'PERSON'),
      at(text, '박서연', 'PERSON'),
    ])
    expect(values(found)).toEqual([
      ['PERSON', '김지원'],
      ['PERSON', '박서연'],
    ])
  })

  test('an overlap prefers the organisation and keeps the wider span', () => {
    const text = '주식회사 한빛 대표'
    const found = refineEntities(text, [
      at(text, '한빛', 'PERSON'),
      at(text, '주식회사 한빛', 'ORG'),
    ])
    expect(values(found)).toEqual([['ORG', '주식회사 한빛']])
  })
})

/* ---------- Loading a model directory ---------- */

const sha256 = (input: string | Uint8Array) =>
  createHash('sha256').update(input).digest('hex')

/** A fake runtime whose "model" tags every token of 김지원 as a person and the rest O. */
function fakeRuntime(calls: { runs: number; windows: number[] }): OrtRuntime {
  const personIds = new Set([vocab.get('김지'), vocab.get('##원')])
  class Tensor {
    constructor(
      readonly type: string,
      readonly data: BigInt64Array,
      readonly dims: readonly number[],
    ) {}
  }
  return {
    Tensor: Tensor as unknown as OrtRuntime['Tensor'],
    InferenceSession: {
      async create() {
        return {
          inputNames: ['input_ids', 'attention_mask', 'token_type_ids'],
          async run(feeds: Record<string, unknown>) {
            calls.runs += 1
            const ids = (feeds.input_ids as Tensor).data
            calls.windows.push(ids.length)
            const logits = new Float32Array(ids.length * LABELS.length)
            ids.forEach((id, position) => {
              const prev = position > 0 ? ids[position - 1] : -1n
              const label = personIds.has(Number(id))
                ? Number(id) === vocab.get('김지') ||
                  !personIds.has(Number(prev))
                  ? 1
                  : 2
                : 0
              logits[position * LABELS.length + label] = 10
            })
            return {
              logits: { data: logits, dims: [1, ids.length, LABELS.length] },
            }
          },
        }
      },
    },
  }
}

function modelFiles(tamper?: 'model' | 'tokenizer') {
  const model = 'fake onnx bytes'
  const tokenizerJson = JSON.stringify({
    model: { type: 'WordPiece', vocab: parity.vocab },
  })
  const manifest: DetectorManifest = {
    id: 'test/fake-ner',
    revision: '0123456789abcdef',
    license: 'Apache-2.0',
    model: { file: 'model.onnx', sha256: sha256(model) },
    tokenizer: { file: 'tokenizer.json', sha256: sha256(tokenizerJson) },
    ...MANIFEST,
  }
  const manifestText = JSON.stringify(manifest)
  const files: DetectorFiles = {
    manifest: bytes(manifestText),
    model: bytes(tamper === 'model' ? `${model}!` : model),
    tokenizer: bytes(
      tamper === 'tokenizer' ? `${tokenizerJson} ` : tokenizerJson,
    ),
  }
  return { files, manifestSha256: sha256(manifestText) }
}

describe('loading a model', () => {
  test("a verified model finds every mention, across windows longer than the model's limit", async () => {
    const { files, manifestSha256 } = modelFiles()
    const calls = { runs: 0, windows: [] as number[] }
    const detector = await loadDetector(files, fakeRuntime(calls), sha256, {
      expectedManifestSha256: manifestSha256,
    })
    expect(detector.id).toBe('test/fake-ner@01234567')
    // 김지 ##원 계약 = 3 tokens a mention: 150 mentions need several 254-token windows.
    const text = Array.from({ length: 150 }, () => '김지원 계약').join(' ')
    const found = await detector.detect(text)
    expect(calls.runs).toBeGreaterThan(1)
    expect(Math.max(...calls.windows)).toBeLessThanOrEqual(256)
    expect(found).toHaveLength(150)
    expect(new Set(found.map((entity) => entity.value))).toEqual(
      new Set(['김지원']),
    )
    expect(await detector.detect('   ')).toEqual([])
  })

  test('a model, tokenizer or manifest that does not match its hash is refused before it runs', async () => {
    const calls = { runs: 0, windows: [] as number[] }
    for (const tamper of ['model', 'tokenizer'] as const) {
      const { files } = modelFiles(tamper)
      await expect(
        loadDetector(files, fakeRuntime(calls), sha256),
      ).rejects.toBeInstanceOf(DetectorIntegrityError)
    }
    const { files } = modelFiles()
    await expect(
      loadDetector(files, fakeRuntime(calls), sha256, {
        expectedManifestSha256: '0'.repeat(64),
      }),
    ).rejects.toBeInstanceOf(DetectorIntegrityError)
    expect(calls.runs).toBe(0)
  })
})
