import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const ocr = readFileSync('src/services/paddleOcr.ts','utf8')
const page = readFileSync('src/views/OcrQualityPage.vue','utf8')
const start = ocr.indexOf('async function retryPermitChineseName(')
const end = ocr.indexOf('export async function recognizeTaiwanCompatriotPermitWithPaddle(',start)
assert.ok(start>=0 && end>start)
const retry = ocr.slice(start,end)
for (const expected of [
  'summary.attemptedCrops += 1',
  'summary.cropsWithTextBoxes += 1',
  'summary.cropsWithNameCandidates += 1',
  'diagnostic?.(summary)',
]) assert.ok(retry.includes(expected), expected)
assert.match(ocr,/retryPermitChineseName\(\s*instance,\s*best\.predictionImage,\s*best\.prediction,\s*retryDiagnostic/)
assert.match(page,/summary => \{ retryDetection = summary \}/)
assert.match(page,/permitRetryDetectionCounts:/)
assert.doesNotMatch(retry,/diagnostic\?\.\(.*\.text/)
console.log('Permit retry detection aggregate source guard passed')
