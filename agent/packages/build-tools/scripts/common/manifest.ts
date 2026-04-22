import { ARCHES, type Arch } from './arch'

export interface Artifact {
  key: string
  sha256: string
  sizeBytes: number
}

export interface AgentEntry {
  image: string
  version: string
  tarballs: Record<Arch, Artifact>
}

export interface VmManifest {
  schemaVersion: 1
  vmVersion: string
  updatedAt: string
  vmDisk: Record<Arch, Artifact>
  agents: Record<string, AgentEntry>
}

export interface BundleAgent {
  name: string
  image: string
  version: string
}

export interface Bundle {
  vmVersion: string
  agents: BundleAgent[]
}

export interface ArtifactInput {
  sha256: string
  sizeBytes: number
}

export interface ArtifactInputs {
  vmDisk: Record<Arch, ArtifactInput>
  agents: Record<string, Record<Arch, ArtifactInput>>
}

export function qcow2Key(vmVersion: string, arch: Arch): string {
  return `vm/browseros-vm-${vmVersion}-${arch}.qcow2.zst`
}

export function tarballKey(name: string, version: string, arch: Arch): string {
  return `vm/images/${name}-${version}-${arch}.tar.gz`
}

export function buildManifest(
  bundle: Bundle,
  inputs: ArtifactInputs,
  now: Date = new Date(),
): VmManifest {
  const vmDisk = {} as Record<Arch, Artifact>
  for (const arch of ARCHES) {
    const entry = inputs.vmDisk[arch]
    if (!entry) throw new Error(`missing vmDisk inputs for arch ${arch}`)
    vmDisk[arch] = {
      key: qcow2Key(bundle.vmVersion, arch),
      sha256: entry.sha256,
      sizeBytes: entry.sizeBytes,
    }
  }

  const agents: Record<string, AgentEntry> = {}
  for (const agent of bundle.agents) {
    const tarballs = {} as Record<Arch, Artifact>
    for (const arch of ARCHES) {
      const entry = inputs.agents[agent.name]?.[arch]
      if (!entry) {
        throw new Error(`missing tarball inputs for ${agent.name}/${arch}`)
      }
      tarballs[arch] = {
        key: tarballKey(agent.name, agent.version, arch),
        sha256: entry.sha256,
        sizeBytes: entry.sizeBytes,
      }
    }
    agents[agent.name] = {
      image: agent.image,
      version: agent.version,
      tarballs,
    }
  }

  return {
    schemaVersion: 1,
    vmVersion: bundle.vmVersion,
    updatedAt: now.toISOString(),
    vmDisk,
    agents,
  }
}
