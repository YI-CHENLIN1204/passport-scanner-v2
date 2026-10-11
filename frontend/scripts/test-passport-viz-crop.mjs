import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('src/services/paddleOcr.ts', 'utf8')
const start = source.indexOf('async function createTaiwanVizCrop(')
const end = source.indexOf('async function createBottomCrop(', start)
assert.ok(start >= 0 && end > start)
const viz = source.slice(start, end)
assert.match(viz, /return createPixelCrop\(/)
assert.match(viz, /width \* 0\.24/)
assert.match(viz, /height \* 0\.12/)
assert.match(viz, /width \* 0\.74/)
assert.match(viz, /height \* 0\.58/)
assert.match(viz, /1500,/)
assert.doesNotMatch(viz, /return createRelativeCrop\(/)
const predict = source.slice(
  source.indexOf('async function predictOne('),
  source.indexOf('async function predictPassportWithDistanceFallback('),
)
assert.match(predict, /if \(vizName\) \{/)
assert.match(predict, /if \(crop\.source === 'viz-crop'\) break/)
assert.match(predict, /chooseTaiwanChineseName\(/)
assert.match(source, /OCR_PIPELINE_VERSION\s*=\s*'2026\.10\.11\.23'/)
console.log('Passport .21 bounded VIZ crop guards passed')
