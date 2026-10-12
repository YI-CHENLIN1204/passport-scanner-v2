#!/usr/bin/env node
// Explicit local-only model setup. Never reads OCR samples or any private data.
import { spawnSync } from 'node:child_process'
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'

const input = resolve('.local-ocr-models/server-rec')
const output = resolve('public/paddle-models/experiments/PP-OCRv5_server_rec_onnx.tar')
const run = (args) => {
  const r=spawnSync(process.execPath,args,{stdio:'inherit'})
  if (r.status !== 0) process.exit(r.status || 1)
}
if (existsSync(output)) {
  console.error('Candidate archive already exists. Delete it manually to replace it: '+output)
  process.exit(1)
}
mkdirSync(resolve('public/paddle-models/experiments'),{recursive:true})
run(['scripts/download-official-ocr-server-model.mjs',input])
const yaml = readFileSync(join(input,'inference.yml'),'utf8')
const actual = yaml.match(/^\s*model_name:\s*['"]?([^\s'"#]+)/m)?.[1] ?? ''
if (!['PP-OCRv5_server_rec','PP-OCRv5_server_rec_onnx'].includes(actual)) {
  console.error('Unexpected recognition model_name: ' + actual)
  process.exit(1)
}
run(['scripts/package-ocr-server-model.mjs',input,output])
run(['scripts/inspect-ocr-model-tar.mjs',output,actual])
writeFileSync(resolve('public/paddle-models/experiments/server-rec-manifest.json'),
  JSON.stringify({ modelName: actual, archive: 'PP-OCRv5_server_rec_onnx.tar' }, null, 2) + '\n')
console.log('SDK textRecognitionModelName must be: ' + actual)
console.log('Official model asset prepared at /paddle-models/experiments/PP-OCRv5_server_rec_onnx.tar')
console.log('Static checks passed; browser SDK runtime still requires a separate smoke test.')
