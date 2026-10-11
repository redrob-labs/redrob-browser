/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Where the privacy model comes from, and the one loaded copy of it.
 *
 * The model is about 143 MB, so it is not in the installer: it is downloaded the first time someone
 * chooses High or Strict, into `<browseros dir>/privacy-model`, from a pinned revision, and every
 * file is checked against the manifest compiled into this server before it is kept or loaded.
 * Until it is ready the gate works on patterns and listed names, and `status()` says so, which is
 * what the Privacy screen shows instead of claiming the model is running.
 *
 * The runtime is onnxruntime-node (measured in packages/privacy/bench/RESULTS.md). A compiled
 * server opens it from `<resources>/bin/third_party/onnxruntime`, through the pinned native-addon
 * guard; under `bun run` it is the ordinary package.
 */

import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  type DetectedEntity,
  DetectorIntegrityError,
  type EntityDetector,
  loadDetector,
  type OrtRuntime,
} from '@browseros/privacy/detector'
import { getBrowserosDir } from '../browseros-dir'
import { logger } from '../logger'
import { PINNED_MANIFEST_TEXT } from './privacy-model-manifest'

/**
 * `1T/veil-pii-ko-lite`, the model Redrob Cowork measured and ships (Apache-2.0). The manifest is
 * Cowork's `apps/desktop/resources/privacy-model/manifest.json`, byte for byte, so its hash is the
 * same pin.
 */
export const PRIVACY_MODEL = {
  id: '1T/veil-pii-ko-lite',
  revision: 'dd26d2b1ca189f9c819a783f75e944e4baf22050',
  manifestSha256:
    '7097232d0a0164bfe6f6e34ec5dcb1d1961ae162b58369eefe0be3afc386fb47',
  files: {
    'model.int8.onnx':
      '35f8fd66a328b32b67b79f93a4c29d790dddaa8f094a165efc095ef5e312194d',
    'tokenizer.json':
      '6849f7236f75a1c86d5ce5ca28ef30ffeaa1addf5eb7ebf97302840e0f957e4a',
  },
  bytes: 143_795_856,
} as const

const MODEL_BASE_URL = `https://huggingface.co/${PRIVACY_MODEL.id}/resolve/${PRIVACY_MODEL.revision}`

export type DetectorStatus =
  | { state: 'ready'; model: string }
  | { state: 'not-loaded' }
  | { state: 'downloading'; receivedBytes: number; totalBytes: number }
  | { state: 'absent'; reason: string }
  | { state: 'failed'; reason: string }

const CACHE_LIMIT = 2_000

const sha256 = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex')

export interface DetectorSourceOptions {
  directory?: string
  resourcesDir?: string | null
  /** File name to SHA-256 of what is downloaded. Replaced in tests; the real pins by default. */
  files?: Readonly<Record<string, string>>
  /** Replaced in tests; production reads the pinned manifest and fetches from the model host. */
  readManifest?: () => Promise<Uint8Array>
  fetchFile?: (
    name: string,
    onProgress: (bytes: number) => void,
  ) => Promise<Uint8Array>
  loadRuntime?: () => Promise<OrtRuntime>
  load?: typeof loadDetector
}

export class DetectorSource {
  private loading: Promise<EntityDetector | null> | null = null
  private downloading: Promise<void> | null = null
  private current: DetectorStatus
  /** Detection results by text, in memory only: every model step resends the whole history. */
  private readonly cache = new Map<string, DetectedEntity[]>()
  private readonly directory: string
  private readonly files: Readonly<Record<string, string>>

  constructor(private readonly options: DetectorSourceOptions = {}) {
    this.files = options.files ?? PRIVACY_MODEL.files
    this.directory =
      options.directory ?? join(getBrowserosDir(), 'privacy-model')
    this.current = this.installed()
      ? { state: 'not-loaded' }
      : { state: 'absent', reason: 'the privacy model is not downloaded yet' }
  }

  status(): DetectorStatus {
    return this.current
  }

  private installed(): boolean {
    return ['manifest.json', ...Object.keys(this.files)].every((name) =>
      existsSync(join(this.directory, name)),
    )
  }

  /**
   * Starts the download if the model is missing. Resolves when it is installed or has failed;
   * never throws, because a failed download only means patterns, and the status says why.
   */
  ensureDownloaded(): Promise<void> {
    if (this.installed()) return Promise.resolve()
    this.downloading ??= this.download().finally(() => {
      this.downloading = null
    })
    return this.downloading
  }

  private async download(): Promise<void> {
    const total = PRIVACY_MODEL.bytes
    let received = 0
    this.current = { state: 'downloading', receivedBytes: 0, totalBytes: total }
    const staging = `${this.directory}.download`
    try {
      await rm(staging, { recursive: true, force: true })
      await mkdir(staging, { recursive: true })
      const manifest = await (
        this.options.readManifest ??
        (async () => new TextEncoder().encode(PINNED_MANIFEST_TEXT))
      )()
      if (sha256(manifest) !== PRIVACY_MODEL.manifestSha256) {
        throw new DetectorIntegrityError(
          'privacy model manifest does not match the pinned hash',
        )
      }
      await writeFile(join(staging, 'manifest.json'), manifest)
      const fetchFile = this.options.fetchFile ?? fetchFromModelHost
      for (const [name, expected] of Object.entries(this.files)) {
        const bytes = await fetchFile(name, (chunk) => {
          received += chunk
          this.current = {
            state: 'downloading',
            receivedBytes: received,
            totalBytes: total,
          }
        })
        if (sha256(bytes) !== expected) {
          throw new DetectorIntegrityError(
            `downloaded ${name} does not match its pinned hash`,
          )
        }
        await writeFile(join(staging, name), bytes)
      }
      await rm(this.directory, { recursive: true, force: true })
      await rename(staging, this.directory)
      this.current = { state: 'not-loaded' }
      logger.info('Privacy model downloaded', { model: PRIVACY_MODEL.id })
    } catch (error) {
      await rm(staging, { recursive: true, force: true }).catch(() => {})
      const reason = `the privacy model could not be downloaded: ${errorText(error)}`
      this.current = { state: 'failed', reason }
      logger.warn('Privacy model download failed', { error: errorText(error) })
    }
  }

  /** The loaded detector, loading it on first call. Null when there is none; never throws. */
  get(): Promise<EntityDetector | null> {
    if (this.current.state === 'ready')
      return this.loading ?? Promise.resolve(null)
    if (this.current.state !== 'not-loaded') return Promise.resolve(null)
    this.loading ??= this.load()
    return this.loading
  }

  private async load(): Promise<EntityDetector | null> {
    try {
      const [manifest, model, tokenizer] = await Promise.all(
        ['manifest.json', 'model.int8.onnx', 'tokenizer.json'].map(
          async (name) =>
            new Uint8Array(await readFile(join(this.directory, name))),
        ),
      )
      const ort = await (
        this.options.loadRuntime ??
        (() => loadOnnxRuntime(this.options.resourcesDir))
      )()
      const detector = await (this.options.load ?? loadDetector)(
        { manifest, model, tokenizer },
        ort,
        sha256,
        { expectedManifestSha256: PRIVACY_MODEL.manifestSha256, threads: 4 },
      )
      this.current = { state: 'ready', model: detector.id }
      return detector
    } catch (error) {
      // A tampered file and a runtime that cannot load end the same way, patterns only, but say
      // different things.
      const reason =
        error instanceof DetectorIntegrityError
          ? `the privacy model failed its integrity check: ${error.message}`
          : `the privacy model could not be loaded: ${errorText(error)}`
      this.current = { state: 'failed', reason }
      this.loading = null
      logger.warn('Privacy model unavailable', { reason })
      return null
    }
  }

  /** Detection with the per-text cache. Throws when the model fails mid-run: the gate fails closed. */
  async detect(
    detector: EntityDetector,
    text: string,
  ): Promise<DetectedEntity[]> {
    const key = createHash('sha256').update(text).digest('base64url')
    const hit = this.cache.get(key)
    if (hit) {
      this.cache.delete(key)
      this.cache.set(key, hit)
      return hit
    }
    const found = await detector.detect(text)
    this.cache.set(key, found)
    while (this.cache.size > CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value
      if (oldest === undefined) break
      this.cache.delete(oldest)
    }
    return found
  }
}

/** Where a compiled server finds the runtime it ships with. */
export function shippedRuntimeDir(resourcesDir: string): string {
  return join(resourcesDir, 'bin', 'third_party', 'onnxruntime')
}

async function loadOnnxRuntime(
  resourcesDir: string | null | undefined,
): Promise<OrtRuntime> {
  // The compiled server's bundle opens the binding from REDROB_ORT_DIR (see
  // ortBindingFromDiskPlugin); under `bun run` the package resolves it itself.
  if (resourcesDir && !process.env.REDROB_ORT_DIR) {
    const dir = shippedRuntimeDir(resourcesDir)
    if (existsSync(dir)) process.env.REDROB_ORT_DIR = dir
  }
  return (await import('onnxruntime-node')) as OrtRuntime
}

async function fetchFromModelHost(
  name: string,
  onProgress: (bytes: number) => void,
): Promise<Uint8Array> {
  const response = await fetch(`${MODEL_BASE_URL}/${name}`, {
    redirect: 'follow',
  })
  if (!response.ok || !response.body) {
    throw new Error(`${name}: HTTP ${response.status}`)
  }
  const chunks: Uint8Array[] = []
  let length = 0
  const reader = response.body.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    length += value.byteLength
    onProgress(value.byteLength)
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
