/**
 * @license
 * Copyright 2026 Janghoon Lee (Redrob) and contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterEach, describe, expect, it } from 'bun:test'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DetectorSource,
  PRIVACY_MODEL,
} from '../../../src/lib/privacy/detector-source'
import { PINNED_MANIFEST_TEXT } from '../../../src/lib/privacy/privacy-model-manifest'

const dirs: string[] = []
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() ?? '', { recursive: true, force: true })
})

const sha256 = (bytes: string | Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex')

function modelDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'redrob-privacy-model-'))
  dirs.push(dir)
  return join(dir, 'privacy-model')
}

describe('the privacy model source', () => {
  it('ships Cowork’s manifest byte for byte, and the manifest names the pinned files', () => {
    expect(sha256(PINNED_MANIFEST_TEXT)).toBe(PRIVACY_MODEL.manifestSha256)
    const manifest = JSON.parse(PINNED_MANIFEST_TEXT)
    expect(manifest.id).toBe(PRIVACY_MODEL.id)
    expect(manifest.revision).toBe(PRIVACY_MODEL.revision)
    expect(manifest.license).toBe('Apache-2.0')
    expect(PRIVACY_MODEL.files[manifest.model.file as 'model.int8.onnx']).toBe(
      manifest.model.sha256,
    )
    expect(
      PRIVACY_MODEL.files[manifest.tokenizer.file as 'tokenizer.json'],
    ).toBe(manifest.tokenizer.sha256)
  })

  it('says the model is not downloaded, and loads nothing, until it is', async () => {
    const source = new DetectorSource({ directory: modelDir() })
    expect(source.status()).toEqual({
      state: 'absent',
      reason: 'the privacy model is not downloaded yet',
    })
    expect(await source.get()).toBeNull()
  })

  it('refuses a download that does not match its pin, and keeps nothing', async () => {
    const directory = modelDir()
    const source = new DetectorSource({
      directory,
      fetchFile: async (_name, onProgress) => {
        onProgress(4)
        return new TextEncoder().encode('evil')
      },
    })
    await source.ensureDownloaded()
    expect(source.status()).toMatchObject({ state: 'failed' })
    expect(String((source.status() as { reason: string }).reason)).toContain(
      'does not match its pinned hash',
    )
    expect(existsSync(directory)).toBe(false)
    expect(existsSync(`${directory}.download`)).toBe(false)
  })

  it('downloads once however many callers ask, and reports progress', async () => {
    const directory = modelDir()
    const bytes = {
      'model.int8.onnx': new TextEncoder().encode('model'),
      'tokenizer.json': new TextEncoder().encode('tokenizer'),
    }
    let fetches = 0
    const seen: string[] = []
    const source = new DetectorSource({
      directory,
      files: {
        'model.int8.onnx': sha256(bytes['model.int8.onnx']),
        'tokenizer.json': sha256(bytes['tokenizer.json']),
      },
      fetchFile: async (name, onProgress) => {
        fetches += 1
        const body = bytes[name as keyof typeof bytes]
        onProgress(body.byteLength)
        seen.push(source.status().state)
        return body
      },
    })
    await Promise.all([source.ensureDownloaded(), source.ensureDownloaded()])
    expect(fetches).toBe(2)
    expect(seen).toEqual(['downloading', 'downloading'])
    expect(source.status()).toEqual({ state: 'not-loaded' })
    expect(readdirSync(directory).sort()).toEqual([
      'manifest.json',
      'model.int8.onnx',
      'tokenizer.json',
    ])
  })

  it('loads the real model when one is present (PRIVACY_MODEL_DIR)', async () => {
    const real = process.env.PRIVACY_MODEL_DIR
    if (!real) return
    const source = new DetectorSource({ directory: real })
    const detector = await source.get()
    expect(source.status()).toEqual({
      state: 'ready',
      model: `${PRIVACY_MODEL.id}@${PRIVACY_MODEL.revision.slice(0, 8)}`,
    })
    const found = await detector?.detect('김지원님은 주식회사 한빛에 연락했다.')
    expect(found?.map((entity) => entity.category)).toContain('PERSON')
  })
})
