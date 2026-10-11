import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Source guard only: no real OCR image execution in this test.
const s = readFileSync('src/services/paddleOcr.ts', 'utf8')
const start=s.indexOf('async function createPermitNameGroupCrop(')
const end=s.indexOf('async function retryPermitChineseName(',start)
assert.ok(start>=0 && end>start)
const body=s.slice(start,end)
assert.match(body,/const chineseLabelAnchors = geometries/)
assert.match(body,/const englishLabelAnchors = geometries/)
assert.match(body,/const anchor =\s*chineseLabelAnchors\[0\] \?\?\s*englishLabelAnchors\[0\] \?\?\s*latinAnchors\[0\]\?\.item/)
assert.match(body,/createPixelCrop\(/)
console.log('Permit ROI Chinese-label priority source guard passed')
