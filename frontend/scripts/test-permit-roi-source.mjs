import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Guards that coordinates from a selected crop are never applied to the
// unrelated full-sized photograph. Does not test actual photo accuracy.
const source = readFileSync('src/services/paddleOcr.ts','utf8')
const start = source.indexOf('async function predictPermit(')
const end = source.indexOf('async function createPermitNameGroupCrop(',start)
assert.ok(start >= 0 && end > start)
const predict = source.slice(start,end)
assert.match(predict,/let bestPredictionImage = image/)
assert.match(predict,/bestPrediction = cropPrediction\s+bestPredictionImage = crop\.file/)
assert.match(predict,/predictionImage: bestPredictionImage/)
const mainStart = source.indexOf('export async function recognizeTaiwanCompatriotPermitWithPaddle(')
const mainEnd = source.indexOf('export type TaiwanNationalIdSex',mainStart)
assert.ok(mainStart >= 0 && mainEnd > mainStart)
const main = source.slice(mainStart,mainEnd)
assert.match(main,/predictionImage: predicted\.predictionImage/)
assert.match(main,/predictionImage: deskewPrediction\.predictionImage/)
assert.match(main,/retryPermitChineseName\(\s*instance,\s*best\.predictionImage,\s*best\.prediction/)
assert.match(main,/const reviewImage = best\.image/)
assert.doesNotMatch(main,/retryPermitChineseName\(\s*instance,\s*best\.image,/)
console.log('Permit ROI coordinate-source consistency guard passed')
