import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const dir = mkdtempSync(resolve('node_modules', '.permit-name-enhance-'))
let enhance
try {
  const compiled = ts.transpileModule(
    readFileSync('src/services/permitNameEnhancement.ts', 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
  ).outputText
  const file = resolve(dir, 'enhance.mjs')
  writeFileSync(file, compiled)
  ;({ enhancePermitNamePixels: enhance } = await import(pathToFileURL(file).href))
} finally {
  rmSync(dir, { recursive: true, force: true })
}

const source = new Uint8ClampedArray([
  100, 150, 200, 255,
  10, 10, 10, 128,
  250, 250, 250, 64,
])
const result = enhance(source.slice())
for (let index = 0; index < result.length; index += 4) {
  assert.equal(result[index], result[index + 1])
  assert.equal(result[index + 1], result[index + 2])
  assert.ok(result[index] >= 0 && result[index] <= 255)
}
assert.equal(result[3], 255)
assert.equal(result[7], 128)
assert.equal(result[11], 64)

const ocr = readFileSync('src/services/paddleOcr.ts', 'utf8')
const retryStart = ocr.indexOf('async function retryPermitChineseName(')
const retryEnd = ocr.indexOf('export async function recognizeTaiwanCompatriotPermitWithPaddle(', retryStart)
const retry = ocr.slice(retryStart, retryEnd)
assert.match(retry, /createPermitNameEnhancedVariant\(enhancementSource\)/)
assert.match(retry, /if \(!canContinue\(\)\) break/)
assert.match(retry, /completedPasses \+= 1/)
assert.match(retry, /passes: completedPasses/)
assert.match(ocr, /OCR_PIPELINE_VERSION = '2026\.10\.11\.10'/)

console.log('Permit name enhancement functional and retry-budget tests passed')
