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
assert.match(crop, /Math\.max\(width, Math\.min\(minimumTargetWidth, width \* 2\.5\)\)/)
assert.match(crop, /Math\.min\(\s*1800,/)
assert.match(crop, /Math\.max\(0, Math\.min\(bitmap\.width - 1, Math\.floor\(sourceX\)\)\)/)
assert.match(crop, /Math\.max\(0, Math\.min\(bitmap\.height - 1, Math\.floor\(sourceY\)\)\)/)
function targetWidth(width, minimum = 1500) {
  return Math.min(1800, Math.max(width, Math.min(minimum, width * 2.5)))
}
assert.equal(targetWidth(300), 750)
assert.equal(targetWidth(600), 1500)
assert.equal(targetWidth(1200), 1500)
assert.equal(targetWidth(2000), 1800)
assert.match(source, /OCR_PIPELINE_VERSION\\s*=\\s*'2026\\.10\\.11\\.13'/)
console.log('Permit broad-name retry crop source guard passed')
