import { describe, expect, it } from 'bun:test'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runPythonJsonEvaluator } from '../../src/grading/python-evaluator'

async function writeScript(source: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'eval-python-'))
  const script = join(dir, 'script.py')
  await writeFile(script, source)
  return script
}

describe('runPythonJsonEvaluator', () => {
  it('sends JSON on stdin, captures stderr, and parses stdout JSON', async () => {
    const script = await writeScript(`
import json, sys
data = json.loads(sys.stdin.read())
print("warning", file=sys.stderr)
print(json.dumps({"ok": True, "value": data["value"]}))
`)

    const result = await runPythonJsonEvaluator<{ ok: boolean; value: number }>(
      {
        scriptPath: script,
        input: { value: 42 },
        timeoutMs: 5_000,
      },
    )

    expect(result.output).toEqual({ ok: true, value: 42 })
    expect(result.stderr).toContain('warning')
    expect(result.exitCode).toBe(0)
  })

  it('reports non-zero exits with stderr', async () => {
    const script = await writeScript(`
import sys
print("bad verifier", file=sys.stderr)
sys.exit(3)
`)

    await expect(
      runPythonJsonEvaluator({
        scriptPath: script,
        input: {},
        timeoutMs: 5_000,
      }),
    ).rejects.toThrow('bad verifier')
  })

  it('enforces timeouts', async () => {
    const script = await writeScript(`
import time
time.sleep(5)
`)

    await expect(
      runPythonJsonEvaluator({
        scriptPath: script,
        input: {},
        timeoutMs: 50,
      }),
    ).rejects.toThrow('timed out')
  })
})
