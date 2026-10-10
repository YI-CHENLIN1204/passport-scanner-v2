import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(
  dirname(fileURLToPath(import.meta.url)), '..',
)
const from = resolve(
  appRoot, 'node_modules/onnxruntime-web/dist',
)
const to = resolve(appRoot, 'public/ort-wasm')

if (!existsSync(from)) {
  throw new Error('onnxruntime-web/dist unavailable after npm install')
}

const wasmFiles = readdirSync(from)
  .filter(file => file.startsWith('ort-') && file.endsWith('.wasm'))

if (wasmFiles.length === 0) {
  throw new Error('No ONNX Runtime Web WASM files found')
}

mkdirSync(to, { recursive: true })
for (const file of wasmFiles) {
  copyFileSync(resolve(from, file), resolve(to, file))
}

console.log(
  'Prepared ' + wasmFiles.length +
  ' local ONNX Runtime WASM assets in public/ort-wasm',
)
