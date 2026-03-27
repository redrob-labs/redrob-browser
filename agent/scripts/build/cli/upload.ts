import { existsSync, readdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { log } from '../log'
import { createR2Client, joinObjectKey, uploadFileToObject } from '../server/r2'
import { loadCliUploadConfig } from './config'

const CDN_BASE_URL = 'https://cdn.browseros.com'

const INSTALLERS = [
  {
    filePath: join('apps', 'cli', 'scripts', 'install.sh'),
    objectName: 'install.sh',
    contentType: 'text/x-shellscript; charset=utf-8',
  },
  {
    filePath: join('apps', 'cli', 'scripts', 'install.ps1'),
    objectName: 'install.ps1',
    contentType: 'text/plain; charset=utf-8',
  },
] as const

export interface CliReleaseOptions {
  version: string
  binariesDir: string
}

function resolveRootDir(): string {
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
  process.chdir(rootDir)
  return rootDir
}

export async function runCliInstallerUpload(): Promise<void> {
  await uploadCliInstallers(resolveRootDir())
}

export async function runCliRelease(options: CliReleaseOptions): Promise<void> {
  await uploadCliRelease(resolveRootDir(), options)
}

export async function uploadCliInstallers(rootDir: string): Promise<void> {
  const { r2 } = loadCliUploadConfig(rootDir)
  const client = createR2Client(r2)

  log.header('Uploading BrowserOS CLI installer scripts')

  try {
    for (const installer of INSTALLERS) {
      const absolutePath = join(rootDir, installer.filePath)
      if (!existsSync(absolutePath)) {
        throw new Error(`Installer script not found: ${installer.filePath}`)
      }

      const objectKey = joinObjectKey(r2.uploadPrefix, installer.objectName)
      log.step(`Uploading ${installer.filePath}`)
      await uploadFileToObject(client, r2, objectKey, absolutePath, {
        contentType: installer.contentType,
      })
      log.success(`Uploaded ${objectKey}`)
      log.info(`${CDN_BASE_URL}/${objectKey}`)
    }

    log.done('CLI installer upload completed')
  } finally {
    client.destroy()
  }
}

async function uploadCliRelease(
  rootDir: string,
  options: CliReleaseOptions,
): Promise<void> {
  const { version, binariesDir } = options
  const absoluteBinariesDir = resolve(rootDir, binariesDir)

  if (!existsSync(absoluteBinariesDir)) {
    throw new Error(`Binaries directory not found: ${binariesDir}`)
  }

  const archives = readdirSync(absoluteBinariesDir).filter(
    (f) => f.endsWith('.tar.gz') || f.endsWith('.zip') || f === 'checksums.txt',
  )
  if (archives.length === 0) {
    throw new Error(`No archives found in ${binariesDir}`)
  }

  const { r2 } = loadCliUploadConfig(rootDir)
  const client = createR2Client(r2)

  log.header(`Uploading BrowserOS CLI v${version} release`)

  try {
    for (const filename of archives) {
      const filePath = join(absoluteBinariesDir, filename)
      const versionedKey = joinObjectKey(
        r2.uploadPrefix,
        `v${version}`,
        filename,
      )
      const latestKey = joinObjectKey(r2.uploadPrefix, 'latest', filename)

      log.step(`Uploading ${filename}`)
      await uploadFileToObject(client, r2, versionedKey, filePath)
      await uploadFileToObject(client, r2, latestKey, filePath)
      log.success(`Uploaded ${filename}`)
      log.info(`${CDN_BASE_URL}/${versionedKey}`)
    }

    const versionTxtPath = join(tmpdir(), 'browseros-cli-version.txt')
    await writeFile(versionTxtPath, version, 'utf-8')
    const versionKey = joinObjectKey(r2.uploadPrefix, 'latest', 'version.txt')
    await uploadFileToObject(client, r2, versionKey, versionTxtPath, {
      contentType: 'text/plain; charset=utf-8',
    })
    log.success(`Uploaded ${versionKey}`)
    log.info(`${CDN_BASE_URL}/${versionKey}`)

    log.done('CLI binary upload completed')
  } finally {
    client.destroy()
  }

  await uploadCliInstallers(rootDir)
}
