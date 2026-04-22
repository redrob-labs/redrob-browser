export const ARCHES = ['amd64', 'arm64'] as const

export type ContainerArch = (typeof ARCHES)[number]

export function parseArch(value: string): ContainerArch {
  if (value === 'amd64' || value === 'arm64') {
    return value
  }

  throw new Error(`invalid container arch: ${value}`)
}
