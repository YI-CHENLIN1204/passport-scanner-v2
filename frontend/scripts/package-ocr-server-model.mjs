#!/usr/bin/env node
// Package locally downloaded official ONNX model artifacts as an SDK-compatible
// uncompressed tar. No customer or passport image is ever accessed.
import { createReadStream, createWriteStream, existsSync, promises as fs } from 'node:fs'
import { resolve, join, basename } from 'node:path'
import { createHash } from 'node:crypto'
import { pipeline } from 'node:stream/promises'

const model = 'PP-OCRv5_server_rec'
const input = process.argv[2]
const output = process.argv[3]
if (!input || !output || !output.endsWith('.tar')) {
  console.error('Usage: node scripts/package-ocr-server-model.mjs <official-onnx-dir> <output.tar>')
  process.exit(1)
}
const root = resolve(input)
const target = resolve(output)
if (target.startsWith(root + '/') || target.startsWith(root + '\\')) {
  console.error('Output must be outside the source model directory.')
  process.exit(1)
}

function header(name, size) {
  const b = Buffer.alloc(512)
  b.write(name, 0, 100)
  b.write('0000644\0', 100)
  b.write('0000000\0', 108)
  b.write('0000000\0', 116)
  b.write(size.toString(8).padStart(11, '0') + '\0', 124)
  b.write('00000000000\0', 136)
  b.fill(32, 148, 156)
  b.write('0', 156)
  b.write('ustar\0', 257)
  b.write('00', 263)
  const sum = b.reduce((x, y) => x + y, 0)
  b.write(sum.toString(8).padStart(6, '0') + '\0 ', 148)
  return b
}
async function write(stream, buf) {
  if (!stream.write(buf)) await new Promise((resolve, reject) => {
    stream.once('drain', resolve)
    stream.once('error', reject)
  })
}
async function main() {
  const parts = ['inference.onnx', 'inference.yml']
  const paths = parts.map(name => join(root, name))
  for (const path of paths) {
    if (!existsSync(path)) throw Error('Missing ' + basename(path))
  }
  const yaml = await fs.readFile(paths[1], 'utf8')
  const actual = yaml.match(/^\s*model_name:\s*['"]?([^\s'"#]+)/m)?.[1] ?? ''
  if (actual !== model && actual !== model + '_onnx') {
    throw Error('Unexpected official model name: ' + actual)
  }
  const stats = await Promise.all(paths.map(path => fs.stat(path)))
  if (stats.some(stat => !stat.isFile())) throw Error('Invalid input files')
  if (stats[0].size < 1024 * 1024 || stats[1].size < 100) {
    throw Error('Files too small to be real recognition model assets')
  }
  const out = createWriteStream(target, { flags: 'wx' })
  try {
    for (let i = 0; i < paths.length; i++) {
      await write(out, header(parts[i], stats[i].size))
      for await (const chunk of createReadStream(paths[i])) await write(out, chunk)
      const padding = (512 - (stats[i].size % 512)) % 512
      if (padding) await write(out, Buffer.alloc(padding))
    }
    await write(out, Buffer.alloc(1024))
    await new Promise((resolve, reject) => {
      out.once('finish', resolve)
      out.once('error', reject)
      out.end()
    })
  } catch (error) {
    out.destroy()
    await fs.rm(target, { force: true })
    throw error
  }
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(target)) digest.update(chunk)
  console.log(JSON.stringify({
    archive: basename(target), modelNameInYml: actual,
    sha256: digest.digest('hex'), bytes: (await fs.stat(target)).size,
    note: 'Static packaging only, browser runtime compatibility not yet tested',
  }, null, 2))
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
