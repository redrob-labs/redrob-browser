import type { Arch } from '../schema/arch'
import type { BaseImage } from './base-image'

// Runtime snapshot of the base image used for this build. `sha512` comes
// from the pin (verified against Debian's signed SHA512SUMS); `sha256` is
// computed locally after download because Debian doesn't publish SHA256
// sidecars. The manifest exposes sha256 to WS4; sha512 is retained for
// upstream-supply-chain traceability.
export interface BuildBaseImage extends BaseImage {
  sha256: string
}

export interface BuildResult {
  arch: Arch
  version: string
  baseImage: BuildBaseImage
  recipeSha256: string
  rawQcowPath: string
  rawQcowSha256: string
  rawQcowSize: number
  compressedPath: string
  compressedSha256: string
  compressedSize: number
  packages: Record<string, string>
  buildLogPath: string
}

export interface BuildOptions {
  version: string
  arch: Arch
  outputDir: string
  recipePath?: string
  baseImageSha256Override?: string
}
