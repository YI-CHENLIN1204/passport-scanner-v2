import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = mkdtempSync(join(tmpdir(), 'passport-server-model-'))
const source = join(root, 'source')
mkdirSync(source)
try {
  writeFileSync(join(source, 'inference.onnx'), Buffer.alloc(1024 * 1024 + 3, 42))
  writeFileSync(join(source, 'inference.yml'),
    'model_name: PP-OCRv5_server_rec_onnx\n' + '# synthetic test\n'.repeat(30))
  const archive = join(root, 'model.tar')
  const run = (file, ...args) => spawnSync(process.execPath,
    [file, ...args], { encoding: 'utf8' })
  const pack = run('scripts/package-ocr-server-model.mjs', source, archive)
  assert.equal(pack.status, 0, pack.stderr)
  const output = JSON.parse(pack.stdout)
  assert.equal(output.modelNameInYml, 'PP-OCRv5_server_rec_onnx')
  assert.match(output.sha256, /^[a-f0-9]{64}$/)
  const check = run('scripts/inspect-ocr-model-tar.mjs',
    archive, 'PP-OCRv5_server_rec_onnx')
  assert.equal(check.status, 0, check.stderr)
  assert.equal(JSON.parse(check.stdout).structuralPreflightPassed, true)
  assert.equal(run('scripts/package-ocr-server-model.mjs',
    source, archive).status, 1, 'refuse overwrite')
  console.log('Server-rec local model packaging + structural preflight passed')
} finally {
  rmSync(root, { recursive: true, force: true })
}
