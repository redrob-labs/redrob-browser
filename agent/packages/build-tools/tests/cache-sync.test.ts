import { afterEach, describe, expect, it } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  type PlanItem,
  planSync,
  readLocalManifest,
  selectSyncArches,
} from '../scripts/cache-sync'
import type { VmManifest } from '../scripts/common/manifest'
import { sha256File } from '../scripts/common/sha256'

const openclaw = {
  image: 'ghcr.io/openclaw/openclaw',
  version: '2026.4.12',
}

function manifest(
  vmVersion: string,
  diskSha: string,
  tarSha: string,
): VmManifest {
  return {
    schemaVersion: 1,
    vmVersion,
    updatedAt: '2026-04-22T00:00:00.000Z',
    vmDisk: {
      arm64: {
        key: `vm/browseros-vm-${vmVersion}-arm64.qcow2.zst`,
        sha256: `${diskSha}-arm64`,
        sizeBytes: 101,
      },
      x64: {
        key: `vm/browseros-vm-${vmVersion}-x64.qcow2.zst`,
        sha256: `${diskSha}-x64`,
        sizeBytes: 102,
      },
    },
    agents: {
      openclaw: {
        ...openclaw,
        tarballs: {
          arm64: {
            key: 'vm/images/openclaw-2026.4.12-arm64.tar.gz',
            sha256: `${tarSha}-arm64`,
            sizeBytes: 201,
          },
          x64: {
            key: 'vm/images/openclaw-2026.4.12-x64.tar.gz',
            sha256: `${tarSha}-x64`,
            sizeBytes: 202,
          },
        },
      },
    },
  }
}

function keys(plan: PlanItem[]): string[] {
  return plan.map((item) => item.key)
}

describe('planSync', () => {
  it('downloads every selected-arch artifact for a fresh cache', () => {
    const remote = manifest('2026.04.22', 'd1', 't1')

    expect(
      keys(planSync({ local: null, remote, cacheRoot: '/c', arches: ['x64'] })),
    ).toEqual([
      'vm/browseros-vm-2026.04.22-x64.qcow2.zst',
      'vm/images/openclaw-2026.4.12-x64.tar.gz',
    ])
  })

  it('does nothing when the local manifest matches the remote manifest', () => {
    const remote = manifest('2026.04.22', 'd1', 't1')

    expect(
      planSync({ local: remote, remote, cacheRoot: '/c', arches: ['x64'] }),
    ).toEqual([])
  })

  it('downloads only artifacts whose sha256 changed', () => {
    const local = manifest('2026.04.20', 'd-old', 't1')
    const remote = manifest('2026.04.22', 'd-new', 't1')

    expect(
      keys(planSync({ local, remote, cacheRoot: '/c', arches: ['x64'] })),
    ).toEqual(['vm/browseros-vm-2026.04.22-x64.qcow2.zst'])
  })

  it('supports syncing all release arches', () => {
    const remote = manifest('2026.04.22', 'd1', 't1')

    expect(
      planSync({
        local: null,
        remote,
        cacheRoot: '/c',
        arches: ['arm64', 'x64'],
      }),
    ).toHaveLength(4)
  })

  it('selects host arch by default and both arches when requested', () => {
    expect(selectSyncArches(false, 'x64')).toEqual(['x64'])
    expect(selectSyncArches(true, 'x64')).toEqual(['arm64', 'x64'])
  })
})

describe('readLocalManifest', () => {
  let dir: string | null = null

  afterEach(async () => {
    if (!dir) return
    await rm(dir, { recursive: true, force: true })
    dir = null
  })

  it('returns null only when the local manifest is absent', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'browseros-cache-manifest-'))

    await expect(
      readLocalManifest(path.join(dir, 'missing.json')),
    ).resolves.toBeNull()
  })

  it('surfaces corrupt local manifest files', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'browseros-cache-manifest-'))
    const manifestPath = path.join(dir, 'manifest.json')
    await writeFile(manifestPath, '{not json')

    await expect(readLocalManifest(manifestPath)).rejects.toThrow()
  })
})

describe('emit-manifest', () => {
  let dir: string | null = null

  afterEach(async () => {
    if (!dir) return
    await rm(dir, { recursive: true, force: true })
    dir = null
  })

  it('merges a vm slice while preserving agents from the baseline', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'browseros-emit-vm-'))
    const distDir = path.join(dir, 'dist')
    await writeVmFiles(distDir)

    const baseline = manifest('2026.04.20', 'old-disk', 'old-tar')
    const baselinePath = path.join(dir, 'baseline.json')
    const outPath = path.join(dir, 'manifest.json')
    await writeJson(baselinePath, baseline)

    await runEmitManifest([
      '--slice',
      'vm',
      '--dist-dir',
      distDir,
      '--merge-from',
      baselinePath,
      '--out',
      outPath,
    ])

    const merged = JSON.parse(await readFile(outPath, 'utf8')) as VmManifest
    expect(merged.vmVersion).toBe('2026.04.22')
    expect(merged.agents).toEqual(baseline.agents)
    expect(merged.vmDisk.x64.sha256).toBe(
      await sha256File(
        path.join(distDir, 'browseros-vm-2026.04.22-x64.qcow2.zst'),
      ),
    )
  })

  it('merges an agent slice while preserving vmDisk from the baseline', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'browseros-emit-agent-'))
    const distDir = path.join(dir, 'dist')
    await writeAgentFiles(distDir)

    const baseline = manifest('2026.04.20', 'old-disk', 'old-tar')
    const baselinePath = path.join(dir, 'baseline.json')
    const outPath = path.join(dir, 'manifest.json')
    await writeJson(baselinePath, baseline)

    await runEmitManifest([
      '--slice',
      'agents:openclaw',
      '--dist-dir',
      distDir,
      '--merge-from',
      baselinePath,
      '--out',
      outPath,
    ])

    const merged = JSON.parse(await readFile(outPath, 'utf8')) as VmManifest
    expect(merged.vmVersion).toBe('2026.04.20')
    expect(merged.vmDisk).toEqual(baseline.vmDisk)
    expect(merged.agents.openclaw.tarballs.arm64.sha256).toBe(
      await sha256File(
        path.join(distDir, 'images/openclaw-2026.4.12-arm64.tar.gz'),
      ),
    )
  })

  it('fails slice emission without a merge baseline', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'browseros-emit-fail-'))
    const distDir = path.join(dir, 'dist')
    await writeVmFiles(distDir)

    const result = await runEmitManifest(
      [
        '--slice',
        'vm',
        '--dist-dir',
        distDir,
        '--out',
        path.join(dir, 'out.json'),
      ],
      false,
    )

    expect(result.code).toBe(1)
    expect(result.stderr).toContain('--slice vm requires --merge-from')
  })
})

async function writeVmFiles(distDir: string): Promise<void> {
  await mkdir(distDir, { recursive: true })
  await writeFile(
    path.join(distDir, 'browseros-vm-2026.04.22-arm64.qcow2.zst'),
    'arm disk',
  )
  await writeFile(
    path.join(distDir, 'browseros-vm-2026.04.22-x64.qcow2.zst'),
    'x64 disk',
  )
}

async function writeAgentFiles(distDir: string): Promise<void> {
  await mkdir(path.join(distDir, 'images'), { recursive: true })
  await writeFile(
    path.join(distDir, 'images/openclaw-2026.4.12-arm64.tar.gz'),
    'arm tarball',
  )
  await writeFile(
    path.join(distDir, 'images/openclaw-2026.4.12-x64.tar.gz'),
    'x64 tarball',
  )
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

async function runEmitManifest(
  args: string[],
  expectSuccess = true,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(
    ['bun', 'run', 'scripts/emit-manifest.ts', '--', ...args],
    {
      cwd: path.join(import.meta.dir, '..'),
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])

  if (expectSuccess && code !== 0) {
    throw new Error(`emit-manifest failed: ${stderr || stdout}`)
  }

  return { code, stdout, stderr }
}
