import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const dir = mkdtempSync(resolve('node_modules', '.permit-retry-detection-'))
let summarize, aggregate
try {
  const code = ts.transpileModule(
    readFileSync('src/services/permitRetryDetection.ts', 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
  ).outputText
  const file = resolve(dir, 'permitRetryDetection.mjs')
  writeFileSync(file, code)
  ;({ summarizePermitRetryDetection: summarize, aggregatePermitRetryDetection: aggregate } =
    await import(pathToFileURL(file).href))
} finally {
  rmSync(dir, { recursive: true, force: true })
}
const empty = summarize([])
assert.deepEqual(empty, { attemptedCrops: 0, cropsWithTextBoxes: 0, cropsWithNameCandidates: 0 })
const first = summarize([{ hasBoxes: false, hasCandidate: false }, { hasBoxes: true, hasCandidate: true }])
const second = summarize([{ hasBoxes: true, hasCandidate: false }])
assert.deepEqual(summarize([{ hasBoxes: false, hasCandidate: true }]), { attemptedCrops: 1, cropsWithTextBoxes: 0, cropsWithNameCandidates: 0 })
assert.deepEqual(first, { attemptedCrops: 2, cropsWithTextBoxes: 1, cropsWithNameCandidates: 1 })
assert.deepEqual(aggregate([null, empty, first, second]), {
  scansWithRetry: 2, attemptedCrops: 3, cropsWithTextBoxes: 2, cropsWithNameCandidates: 1,
})
const safe = JSON.stringify(aggregate([first, second]))
for (const secret of ['甲乙', 'groundTruth', 'sampleId', 'image', 'rawRows']) assert.ok(!safe.includes(secret))
const ocr = readFileSync('src/services/paddleOcr.ts', 'utf8')
const page = readFileSync('src/views/OcrQualityPage.vue', 'utf8')
assert.match(ocr, /retryPermitChineseName\(\s*instance,\s*best\.predictionImage,\s*best\.prediction,\s*retryDiagnostic/)
assert.match(ocr, /diagnostic\?\.\(summarizePermitRetryDetection\(observations\)\)/)
assert.match(page, /aggregatePermitRetryDetection\(rows\.map\(row => row\.permitRetryDetection\)\)/)
assert.match(page, /rows\.filter\(row => row\.fieldExact\.nameZh === false\)/)
assert.match(page, /result\.permitRetryWrongNameCounts\.cropsWithTextBoxes/)
console.log('Permit retry detection synthetic and wiring guards passed')
