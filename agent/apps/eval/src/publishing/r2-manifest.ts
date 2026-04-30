export interface R2UploadConfig {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  cdnBaseUrl: string
}

export interface R2ManifestTask {
  queryId: string
  query: string
  startUrl: string
  status: string
  durationMs: number
  screenshotCount: number
  graderResults: Record<string, unknown>
}

export interface R2RunManifest {
  runId: string
  uploadedAt: string
  agentConfig?: Record<string, unknown>
  dataset?: string
  summary?: {
    passRate?: unknown
    avgDurationMs?: unknown
  }
  tasks: R2ManifestTask[]
}

export interface R2PublishRunResult {
  runId: string
  uploadedFiles: number
  viewerUrl: string
  manifest: R2RunManifest
}

export interface R2PublishPathResult {
  uploadedRuns: R2PublishRunResult[]
  skippedRuns: string[]
}
