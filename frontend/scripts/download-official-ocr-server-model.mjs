#!/usr/bin/env node
// Explicit opt-in download; only fetches public official model assets.
// Does not access any passport images, application data or user accounts.
import { createWriteStream, createReadStream, promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const base='https://huggingface.co/PaddlePaddle/PP-OCRv5_server_rec_onnx/resolve/main/'
const expectedOnnxSha='d9dc333c9c7b042c6dffb8e33d72b6f65c9c1d463d0a3c2f78174fea55e94752'
const folder=resolve(process.argv[2] ?? '.local-ocr-models/server-rec')
async function download(name) {
  const path=join(folder,name)
  const temp=path+'.partial'
  await fs.rm(temp,{force:true})
  const response=await fetch(base+name+'?download=true', {
    signal:AbortSignal.timeout(300000),
    headers:{'User-Agent':'passport-scanner-v2-ocr-model-preflight'}
  })
  if(!response.ok||!response.body)throw Error(name+' HTTP '+response.status)
  try {
    await pipeline(Readable.fromWeb(response.body),createWriteStream(temp,{flags:'wx'}))
    if(name==='inference.onnx') {
      const sha=createHash('sha256')
      for await (const chunk of createReadStream(temp)) sha.update(chunk)
      if(sha.digest('hex')!==expectedOnnxSha)throw Error('Official ONNX SHA256 mismatch')
    }
    await fs.rename(temp,path)
    return (await fs.stat(path)).size
  } finally {await fs.rm(temp,{force:true})}
}
async function main(){
  await fs.mkdir(folder,{recursive:true})
  const onnx=await download('inference.onnx')
  const yml=await download('inference.yml')
  const contents=await fs.readFile(join(folder,'inference.yml'),'utf8')
  const modelName=contents.match(/^\s*model_name:\s*['"]?([^\s'"#]+)/m)?.[1]??''
  if(!['PP-OCRv5_server_rec','PP-OCRv5_server_rec_onnx'].includes(modelName))
    throw Error('Unexpected model_name in official inference.yml: '+modelName)
  console.log(JSON.stringify({folder,onnxBytes:onnx,ymlBytes:yml,modelName,
    onnxSha256Verified:true,
    note:'No passport data read; model is downloaded only when this command is run.'},null,2))
}
main().catch(e=>{console.error('OFFICIAL_MODEL_DOWNLOAD_FAILED:',e.message);process.exitCode=1})
