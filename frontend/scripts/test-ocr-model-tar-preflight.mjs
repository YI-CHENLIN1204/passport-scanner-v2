import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

function tar(files) {
  const parts = []
  for (const [name, bytes] of files) {
    const header = Buffer.alloc(512)
    header.write(name, 0, 100, 'utf8')
    header.write('0000644\0', 100, 'ascii')
    header.write('0000000\0', 108, 'ascii')
    header.write('0000000\0', 116, 'ascii')
    header.write(bytes.length.toString(8).padStart(11, '0') + '\0', 124, 'ascii')
    header.write('00000000000\0', 136, 'ascii')
    header.fill(32, 148, 156)
    header.write('0', 156, 'ascii')
    header.write('ustar\0', 257, 'ascii')
    header.write('00', 263, 'ascii')
    const checksum = [...header].reduce((sum, byte) => sum + byte, 0)
    header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 'ascii')
    parts.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512))
  }
  return Buffer.concat([...parts, Buffer.alloc(1024)])
}
const root = mkdtempSync(join(tmpdir(), 'passport-model-preflight-'))
try {
  const good = join(root, 'good.tar')
  writeFileSync(good, tar([
    ['inference.onnx', Buffer.from('synthetic only')],
    ['inference.yml', Buffer.from('model_name: PP-OCRv5_server_rec\n')],
  ]))
  const run = (file, name = 'PP-OCRv5_server_rec') => spawnSync(
    process.execPath, ['scripts/inspect-ocr-model-tar.mjs', file, name],
    { encoding: 'utf8' },
  )
  const success = run(good)
  assert.equal(success.status, 0, success.stderr)
  assert.equal(JSON.parse(success.stdout).structuralPreflightPassed, true)
  assert.equal(run(good, 'incorrect-name').status, 1)
  const missing = join(root, 'missing.tar')
  writeFileSync(missing, tar([['inference.yml', Buffer.from('model_name: PP-OCRv5_server_rec\n')]]))
  assert.equal(run(missing).status, 1)
  const invalid = join(root, 'invalid.tar')
  writeFileSync(invalid, Buffer.from('not a tar'))
  assert.equal(run(invalid).status, 1)
  console.log('Model archive structural preflight synthetic tests passed')
} finally {
  rmSync(root, { recursive: true, force: true })
}
