import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source = readFileSync('src/services/paddleOcr.ts', 'utf8')
const from = source.indexOf('async function retryPermitChineseName(')
const to = source.indexOf('export async function recognizeTaiwanCompatriotPermitWithPaddle(', from)
assert.ok(from >= 0 && to > from)
const retry = source.slice(from, to)
assert.match(retry, /const broadBitmap = await createImageBitmap\(image\)/)
assert.match(retry, /const broadBlob = await createPixelCrop\([\s\S]*?1500,\s*\)/)
assert.doesNotMatch(retry, /const broadBlob = await createRelativeCrop/)
const crop = source.slice(source.indexOf('async function createPixelCrop('), source.indexOf('async function createTaiwanNameFieldCrop('))
assert.match(crop, /Math\.min\(\s*1800,\s*Math\.max\(minimumTargetWidth, width\)/)
assert.match(source, /OCR_PIPELINE_VERSION = '2026\.10\.11\.9'/)
console.log('Permit broad-name retry crop source guard passed')
