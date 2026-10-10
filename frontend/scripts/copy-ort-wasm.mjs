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

// ORT 1.30 loads a matching .mjs runtime dynamically before the .wasm
// binary. Missing the .mjs produces "no available backend found [wasm]".
const runtimeAssets = readdirSync(from).filter(
  file => /^ort-wasm-.*\.(wasm|mjs)$/.test(file),
)
const wasmFiles = runtimeAssets.filter(file => file.endsWith('.wasm'))
const loaderFiles = runtimeAssets.filter(file => file.endsWith('.mjs'))

if (wasmFiles.length === 0 || loaderFiles.length === 0) {
  throw new Error(
    'Matching ONNX Runtime Web .mjs loader and .wasm assets are required',
  )
}

const requiredLoader = 'ort-wasm-simd-threaded.jsep.mjs'
if (!loaderFiles.includes(requiredLoader)) {
  throw new Error(
    'ONNX Runtime Web package is missing ' + requiredLoader,
  )
}

mkdirSync(to, { recursive: true })
for (const file of runtimeAssets) {
  copyFileSync(resolve(from, file), resolve(to, file))
}

console.log(
  'Prepared ' + wasmFiles.length + ' WASM and ' +
  loaderFiles.length + ' MJS loaders in public/ort-wasm',
)
