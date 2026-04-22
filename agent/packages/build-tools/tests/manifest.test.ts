import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type ArtifactInputs,
  type Bundle,
  buildManifest,
  qcow2Key,
  tarballKey,
} from '../scripts/common/manifest'
import { verifySha256 } from '../scripts/common/sha256'

const bundle: Bundle = {
  vmVersion: '2026.04.22',
  agents: [
    {
      name: 'openclaw',
      image: 'ghcr.io/openclaw/openclaw',
      version: '2026.4.12',
    },
  ],
}

const inputs: ArtifactInputs = {
  vmDisk: {
    arm64: { sha256: 'disk-arm', sizeBytes: 11 },
    x64: { sha256: 'disk-x64', sizeBytes: 12 },
  },
  agents: {
    openclaw: {
      arm64: { sha256: 'tar-arm', sizeBytes: 21 },
      x64: { sha256: 'tar-x64', sizeBytes: 22 },
    },
  },
}

describe('manifest helpers', () => {
  it('builds release artifact keys', () => {
    expect(qcow2Key('2026.04.22', 'arm64')).toBe(
      'vm/browseros-vm-2026.04.22-arm64.qcow2.zst',
    )
    expect(tarballKey('openclaw', '2026.4.12', 'x64')).toBe(
      'vm/images/openclaw-2026.4.12-x64.tar.gz',
    )
  })

  it('builds a manifest from bundle metadata and artifact inputs', () => {
    const manifest = buildManifest(
      bundle,
      inputs,
      new Date('2026-04-22T00:00:00.000Z'),
    )

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      vmVersion: '2026.04.22',
      updatedAt: '2026-04-22T00:00:00.000Z',
      vmDisk: {
        arm64: {
          key: 'vm/browseros-vm-2026.04.22-arm64.qcow2.zst',
          sha256: 'disk-arm',
          sizeBytes: 11,
        },
      },
      agents: {
        openclaw: {
          image: 'ghcr.io/openclaw/openclaw',
          version: '2026.4.12',
          tarballs: {
            x64: {
              key: 'vm/images/openclaw-2026.4.12-x64.tar.gz',
              sha256: 'tar-x64',
              sizeBytes: 22,
            },
          },
        },
      },
    })
  })

  it('fails when required artifact inputs are missing', () => {
    expect(() =>
      buildManifest(bundle, {
        vmDisk: { arm64: inputs.vmDisk.arm64 } as ArtifactInputs['vmDisk'],
        agents: inputs.agents,
      }),
    ).toThrow('missing vmDisk inputs for arch x64')

    expect(() =>
      buildManifest(bundle, {
        vmDisk: inputs.vmDisk,
        agents: { openclaw: { arm64: inputs.agents.openclaw.arm64 } },
      } as unknown as ArtifactInputs),
    ).toThrow('missing tarball inputs for openclaw/x64')
  })
})

describe('sha256 helpers', () => {
  let dir: string | null = null

  afterEach(async () => {
    if (!dir) return
    await rm(dir, { recursive: true, force: true })
    dir = null
  })

  it('verifies matching file content and rejects mismatches', async () => {
    dir = await mkdtemp(join(tmpdir(), 'browseros-build-tools-'))
    const filePath = join(dir, 'artifact.txt')
    await writeFile(filePath, 'browseros\n')

    await expect(
      verifySha256(
        filePath,
        '8e4e07174da39a48ab7aa9a1bebd3adcddff43172c0b19fcbe921cc47c599f62',
      ),
    ).resolves.toBeUndefined()
    await expect(verifySha256(filePath, 'bad')).rejects.toThrow(
      'sha256 mismatch',
    )
  })
})
