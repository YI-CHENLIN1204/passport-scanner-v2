#!/usr/bin/env node
// Explicit local-only model setup. Never reads OCR samples or any private data.
import { spawnSync } from 'node:child_process'
import { mkdirSync, existsSync } from 'node:fs'
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
run(['scripts/package-ocr-server-model.mjs',input,output])
run(['scripts/inspect-ocr-model-tar.mjs',output,'PP-OCRv5_server_rec_onnx'])
console.log('Official model asset prepared at /paddle-models/experiments/PP-OCRv5_server_rec_onnx.tar')
console.log('Static checks passed; browser SDK runtime still requires a separate smoke test.')
