/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: MIT
 *
 * Measures the privacy model on one ONNX runtime, for PR 1.2 of docs/AI-FEATURES-PLAN.md.
 *
 *   bun bench/runtime.ts --runtime node|web --model <dir> [--threads 4] [--runs 20] [--guard]
 *
 * It prints one JSON line: load time, latency per 1,000 characters on Cowork's latency document,
 * and a digest of every entity found on Cowork's evaluation set. Two runtimes that print the same
 * digest found exactly the same entities, so a faster runtime cannot quietly be a worse one.
 *
 * `--guard` installs the agent server's native-addon guard first, the way compiled-bootstrap.ts
 * does, so a run shows what the shipped server would allow.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { installNativeAddonGuard } from '../../../apps/server/src/lib/native-addon-guard'
import {
  type DetectedEntity,
  loadDetector,
  type OrtRuntime,
} from '../src/detector'
import { buildEvaluationSet, latencyDocument } from './dataset'
import { installPinnedAddonGuard } from './pinned-guard'

const { values } = parseArgs({
  options: {
    runtime: { type: 'string' },
    model: { type: 'string' },
    threads: { type: 'string', default: '4' },
    runs: { type: 'string', default: '20' },
    'wasm-dir': { type: 'string' },
    'ort-node': { type: 'string' },
    guard: { type: 'boolean', default: false },
    'pinned-guard': { type: 'boolean', default: false },
    dump: { type: 'string' },
  },
})

const runtime = values.runtime
const modelDir = values.model ?? ''
if ((runtime !== 'node' && runtime !== 'web') || !modelDir) {
  console.error(
    'usage: runtime.ts --runtime node|web --model <dir> [--threads N] [--runs N] [--wasm-dir DIR] [--ort-node PATH] [--guard | --pinned-guard] [--dump FILE]',
  )
  process.exit(2)
}
const threads = Number(values.threads)
const runs = Number(values.runs)

const sha256 = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex')

async function ortFor(name: 'node' | 'web'): Promise<OrtRuntime> {
  if (name === 'node') {
    // A compiled binary resolves bare imports inside its own bundle, so a runtime shipped beside it
    // is imported by absolute path.
    const shipped = values['ort-node']
    return (
      shipped ? await import(shipped) : await import('onnxruntime-node')
    ) as OrtRuntime
  }
  const ort = await import('onnxruntime-web')
  ort.env.wasm.numThreads = threads
  if (values['wasm-dir']) ort.env.wasm.wasmPaths = `${values['wasm-dir']}/`
  return ort as unknown as OrtRuntime
}

const median = (times: number[]) =>
  [...times].sort((a, b) => a - b)[Math.floor((times.length - 1) / 2)]
const quantile = (times: number[], q: number) =>
  [...times].sort((a, b) => a - b)[Math.floor((times.length - 1) * q)]
const round = (value: number) => Number(value.toFixed(1))

/**
 * Opens the runtime in REDROB_ORT_DIR only if each file matches REDROB_ORT_PINS, a JSON map of file
 * name to SHA-256 written when the runtime was staged (bench/pins.ts). Pins come from the build, not
 * from the files on disk, so a file replaced after staging is refused.
 */
function pinShippedRuntime() {
  const dir = process.env.REDROB_ORT_DIR
  const pinsPath = process.env.REDROB_ORT_PINS
  if (!dir || !pinsPath) {
    throw new Error('--pinned-guard needs REDROB_ORT_DIR and REDROB_ORT_PINS')
  }
  const pins = JSON.parse(readFileSync(pinsPath, 'utf8')) as Record<
    string,
    string
  >
  const files = Object.entries(pins).map(([name, sha256]) => ({
    path: join(dir, name),
    sha256,
  }))
  installPinnedAddonGuard(
    files.filter((file) => file.path.endsWith('.node')),
    files.filter((file) => !file.path.endsWith('.node')),
  )
}

type Counts = { tp: number; found: number; covered: number; gold: number }

/** Cowork's measure: a find counts when it overlaps a gold span; a gold span counts when covered. */
function accuracy(found: Map<string, DetectedEntity[]>) {
  const counts: Record<string, Counts> = {}
  for (const sample of buildEvaluationSet()) {
    const entities = found.get(sample.id) ?? []
    for (const category of ['PERSON', 'ORG', 'ADDRESS'] as const) {
      const gold = sample.gold.filter((span) => span.category === category)
      const mine = entities.filter((entity) => entity.category === category)
      counts[category] ??= { tp: 0, found: 0, covered: 0, gold: 0 }
      const c = counts[category]
      c.gold += gold.length
      c.found += mine.length
      for (const entity of mine) {
        if (gold.some((s) => entity.start < s.end && s.start < entity.end))
          c.tp += 1
      }
      for (const span of gold) {
        if (mine.some((e) => e.start <= span.start && e.end >= span.end))
          c.covered += 1
      }
    }
  }
  const pct = (n: number, d: number) =>
    d ? Number(((100 * n) / d).toFixed(1)) : 100
  return Object.fromEntries(
    Object.entries(counts).map(([category, c]) => [
      category,
      { precision: pct(c.tp, c.found), recall: pct(c.covered, c.gold) },
    ]),
  )
}

async function main() {
  if (values.guard) installNativeAddonGuard()
  const report: Record<string, unknown> = {
    runtime,
    threads,
    guard: values.guard ? 'all' : values['pinned-guard'] ? 'pinned' : 'none',
    host: `${process.platform}-${process.arch}`,
    bun: process.versions.bun ?? null,
  }
  try {
    if (values['pinned-guard']) pinShippedRuntime()
    const ort = await ortFor(runtime as 'node' | 'web')
    const [manifest, model, tokenizer] = await Promise.all(
      ['manifest.json', 'model.int8.onnx', 'tokenizer.json'].map(
        async (file) => new Uint8Array(await readFile(join(modelDir, file))),
      ),
    )
    const started = performance.now()
    const detector = await loadDetector(
      { manifest, model, tokenizer },
      ort,
      sha256,
      {
        expectedManifestSha256:
          '7097232d0a0164bfe6f6e34ec5dcb1d1961ae162b58369eefe0be3afc386fb47',
        threads,
      },
    )
    report.loadMs = Math.round(performance.now() - started)

    const digest = createHash('sha256')
    let entities = 0
    const dump: unknown[] = []
    const all = new Map<string, DetectedEntity[]>()
    for (const sample of buildEvaluationSet()) {
      const found = await detector.detect(sample.text)
      all.set(sample.id, found)
      entities += found.length
      const spans = found.map((e) => [e.category, e.start, e.end, e.value])
      dump.push([sample.id, spans])
      digest.update(JSON.stringify([sample.id, spans]))
    }
    if (values.dump) await writeFile(values.dump, JSON.stringify(dump))
    report.accuracy = accuracy(all)
    report.entities = entities
    report.entitiesDigest = digest.digest('hex').slice(0, 16)

    const doc = latencyDocument()
    for (let index = 0; index < 3; index += 1) await detector.detect(doc)
    const times: number[] = []
    for (let index = 0; index < runs; index += 1) {
      const t0 = performance.now()
      await detector.detect(doc)
      times.push(performance.now() - t0)
    }
    report.chars = doc.length
    report.msPer1000Chars = {
      median: round(median(times)),
      p10: round(quantile(times, 0.1)),
      p90: round(quantile(times, 0.9)),
      max: round(Math.max(...times)),
    }
    report.rssMb = Math.round(process.memoryUsage().rss / 1e6)
    report.ok = true
  } catch (error) {
    report.ok = false
    report.error = error instanceof Error ? error.message : String(error)
  }
  console.log(JSON.stringify(report))
  process.exit(report.ok ? 0 : 1)
}

await main()
