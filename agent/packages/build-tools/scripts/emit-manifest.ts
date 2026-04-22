#!/usr/bin/env bun
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { ARCHES, type Arch } from './common/arch'
import { fetchWithTimeout } from './common/fetch'
import {
  type AgentEntry,
  type Artifact,
  type ArtifactInputs,
  type Bundle,
  type BundleAgent,
  buildManifest,
  qcow2Key,
  tarballKey,
  type VmManifest,
} from './common/manifest'
import { sha256File } from './common/sha256'

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    'dist-dir': { type: 'string', default: './dist' },
    out: { type: 'string' },
    slice: { type: 'string', default: 'full' },
    'merge-from': { type: 'string' },
  },
})

const distDir = values['dist-dir']
const slice = values.slice
const pkgRoot = path.resolve(import.meta.dir, '..')
const bundle = JSON.parse(
  await readFile(path.join(pkgRoot, 'bundle.json'), 'utf8'),
) as Bundle

const baseline = values['merge-from']
  ? await loadBaseline(values['merge-from'])
  : null
if (slice !== 'full' && !baseline) {
  throw new Error(`--slice ${slice} requires --merge-from`)
}

const manifest = await buildSlicedManifest({ bundle, distDir, slice, baseline })
const outPath = values.out ?? path.join(distDir, 'manifest.json')
await mkdir(path.dirname(outPath), { recursive: true })
await writeFile(outPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`wrote ${outPath} (slice=${slice})`)

async function buildSlicedManifest(opts: {
  bundle: Bundle
  distDir: string
  slice: string
  baseline: VmManifest | null
}): Promise<VmManifest> {
  if (opts.slice === 'full') {
    return buildManifest(
      opts.bundle,
      await readAllInputs(opts.bundle, opts.distDir),
    )
  }

  const baseline = opts.baseline
  if (!baseline) throw new Error(`--slice ${opts.slice} requires --merge-from`)
  const updatedAt = new Date().toISOString()

  if (opts.slice === 'vm') {
    return {
      ...baseline,
      schemaVersion: 1,
      vmVersion: opts.bundle.vmVersion,
      updatedAt,
      vmDisk: await readVmDisk(opts.bundle.vmVersion, opts.distDir),
    }
  }

  if (opts.slice.startsWith('agents:')) {
    const name = opts.slice.slice('agents:'.length)
    const agent = opts.bundle.agents.find((entry) => entry.name === name)
    if (!agent) throw new Error(`unknown agent: ${name}`)

    return {
      ...baseline,
      updatedAt,
      agents: {
        ...baseline.agents,
        [name]: await readAgentEntry(agent, opts.distDir),
      },
    }
  }

  throw new Error(`unknown slice: ${opts.slice}`)
}

async function readAllInputs(
  bundle: Bundle,
  distDir: string,
): Promise<ArtifactInputs> {
  const agents: ArtifactInputs['agents'] = {}
  for (const agent of bundle.agents) {
    agents[agent.name] = {} as ArtifactInputs['agents'][string]
    for (const arch of ARCHES) {
      const artifactPath = path.join(
        distDir,
        'images',
        path.basename(tarballKey(agent.name, agent.version, arch)),
      )
      agents[agent.name][arch] = await readArtifactInput(artifactPath)
    }
  }

  return {
    vmDisk: await readArtifactInputs((arch) =>
      path.join(distDir, path.basename(qcow2Key(bundle.vmVersion, arch))),
    ),
    agents,
  }
}

async function readVmDisk(
  vmVersion: string,
  distDir: string,
): Promise<Record<Arch, Artifact>> {
  const vmDisk = {} as Record<Arch, Artifact>
  for (const arch of ARCHES) {
    const key = qcow2Key(vmVersion, arch)
    const artifactPath = path.join(distDir, path.basename(key))
    vmDisk[arch] = { key, ...(await readArtifactInput(artifactPath)) }
  }
  return vmDisk
}

async function readAgentEntry(
  agent: BundleAgent,
  distDir: string,
): Promise<AgentEntry> {
  const tarballs = {} as AgentEntry['tarballs']
  for (const arch of ARCHES) {
    const key = tarballKey(agent.name, agent.version, arch)
    const artifactPath = path.join(distDir, 'images', path.basename(key))
    tarballs[arch] = { key, ...(await readArtifactInput(artifactPath)) }
  }
  return { image: agent.image, version: agent.version, tarballs }
}

async function readArtifactInputs(
  pathForArch: (arch: Arch) => string,
): Promise<Record<Arch, { sha256: string; sizeBytes: number }>> {
  const out = {} as Record<Arch, { sha256: string; sizeBytes: number }>
  for (const arch of ARCHES) {
    out[arch] = await readArtifactInput(pathForArch(arch))
  }
  return out
}

async function readArtifactInput(
  filePath: string,
): Promise<{ sha256: string; sizeBytes: number }> {
  return {
    sha256: await sha256File(filePath),
    sizeBytes: (await stat(filePath)).size,
  }
}

async function loadBaseline(src: string): Promise<VmManifest> {
  if (src.startsWith('http://') || src.startsWith('https://')) {
    const response = await fetchWithTimeout(src)
    if (!response.ok) {
      throw new Error(`baseline fetch failed: ${src} (${response.status})`)
    }
    return (await response.json()) as VmManifest
  }

  return JSON.parse(await readFile(src, 'utf8')) as VmManifest
}
