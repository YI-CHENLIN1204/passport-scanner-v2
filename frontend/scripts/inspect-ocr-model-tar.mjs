#!/usr/bin/env node
// Local-only model compatibility preflight. Reads archive headers/config,
// never uploads data, executes inference, or contacts remote hosts.
import { openSync, closeSync, readSync, statSync } from 'node:fs'
import { resolve, basename } from 'node:path'

function fail(message) {
  console.error('MODEL_PREFLIGHT_FAILED:', message)
  process.exitCode = 1
}
const input = process.argv[2]
const expected = process.argv[3] || 'PP-OCRv5_server_rec'
if (!input || !input.endsWith('.tar')) {
  fail('Usage: node scripts/inspect-ocr-model-tar.mjs /path/to/model.tar [expected_model_name]')
} else {
  const path = resolve(input)
  let fd
  try {
    fd = openSync(path, 'r')
    const length = statSync(path).size
    let pos = 0
    let hasOnnx = false
    let yml = ''
    let archiveEntries = 0
    const block = Buffer.alloc(512)
    while (pos + 512 <= length) {
      if (readSync(fd, block, 0, 512, pos) !== 512) throw Error('truncated tar header')
      if (block.every(byte => byte === 0)) break
      const name = block.toString('utf8', 0, 100).split('\0')[0]
      const sizeText = block.toString('ascii', 124, 136).replace(/\0/g, '').trim()
      const size = parseInt(sizeText, 8)
      if (!name || !Number.isSafeInteger(size) || size < 0 || pos + 512 + size > length)
        throw Error('invalid tar entry header or length')
      archiveEntries++
      const entryName = basename(name)
      if (entryName === 'inference.onnx') hasOnnx = true
      if (entryName === 'inference.yml') {
        if (size > 2 * 1024 * 1024) throw Error('inference.yml exceeds safety limit')
        const buf = Buffer.alloc(size)
        if (readSync(fd, buf, 0, size, pos + 512) !== size) throw Error('truncated inference.yml')
        yml = buf.toString('utf8')
      }
      pos += 512 + Math.ceil(size / 512) * 512
      if (archiveEntries > 10000) throw Error('excessive tar entries')
    }
    const actual = yml.match(/^\s*model_name:\s*['"]?([^\s'"#]+)/m)?.[1] ?? ''
    const ok = hasOnnx && Boolean(yml) && actual === expected
    // Intentionally avoid dumping YAML or model internals.
    console.log(JSON.stringify({
      archive: basename(path),
      bytes: length,
      entries: archiveEntries,
      hasInferenceOnnx: hasOnnx,
      hasInferenceYml: Boolean(yml),
      expectedModelName: expected,
      modelNameMatches: actual === expected,
      structuralPreflightPassed: ok,
      note: 'Static tar check only; does not prove ONNX/browser runtime compatibility.',
    }, null, 2))
    if (!ok) process.exitCode = 1
  } catch (error) {
    fail(error instanceof Error ? error.message : 'cannot inspect model archive')
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}
