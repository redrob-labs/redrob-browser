import type { ContainerArch } from './arch'

export const R2_AGENTS_PREFIX = 'agents'

export function keyForTarball(
  agent: string,
  version: string,
  arch: ContainerArch,
  publishAs = agent,
): string {
  return `${R2_AGENTS_PREFIX}/${agent}/${version}/${publishAs}-${version}-${arch}.tar.gz`
}

export function keyForSha(
  agent: string,
  version: string,
  arch: ContainerArch,
  publishAs = agent,
): string {
  return `${keyForTarball(agent, version, arch, publishAs)}.sha256`
}

export function keyForVersionManifest(agent: string, version: string): string {
  return `${R2_AGENTS_PREFIX}/${agent}/${version}/manifest.json`
}

export function keyForAggregateManifest(): string {
  return `${R2_AGENTS_PREFIX}/manifest.json`
}
