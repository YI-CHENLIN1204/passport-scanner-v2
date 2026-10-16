import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const dir = mkdtempSync(resolve('node_modules', '.permit-sex-retry-'))
let retry
try {
  const compiled = ts.transpileModule(
    readFileSync('src/services/permitSexRetry.ts', 'utf8'),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    },
  ).outputText
  const file = resolve(dir, 'permitSexRetry.mjs')
  writeFileSync(file, compiled)
  retry = await import(pathToFileURL(file).href)
} finally {
  rmSync(dir, { recursive: true, force: true })
}

const fixed = retry.selectPermitSexRetryRegion(1000, 600, [])
assert.deepEqual(fixed, {
  x: 300,
  y: 132,
  width: 480,
  height: 204,
  source: 'fixed',
})

// Fixed-layout fractions must not gain a pixel due to IEEE-754 noise.
const fractional = retry.selectPermitSexRetryRegion(999, 601, [])
assert.equal(fractional?.height, 205)
assert.equal(fractional?.width, 480)

const labeled = retry.selectPermitSexRetryRegion(
  1000,
  600,
  [{
    text: '性別',
    score: 0.91,
    minX: 500,
    maxX: 550,
    minY: 220,
    maxY: 240,
    height: 20,
  }],
)
assert.equal(labeled?.source, 'label')
assert.equal(labeled?.x, 460)
assert.equal(labeled?.y, 180)
assert.equal(labeled?.width, 300)
assert.equal(labeled?.height, 120)

assert.deepEqual(
  retry.collectPermitSexRetryEvidence(['Sex F'], []),
  { value: 'F', candidateCount: 1, conflicting: false },
)
assert.deepEqual(
  retry.collectPermitSexRetryEvidence([], ['女']),
  { value: 'F', candidateCount: 1, conflicting: false },
)
assert.deepEqual(
  retry.collectPermitSexRetryEvidence(['性別男'], ['M']),
  { value: 'M', candidateCount: 2, conflicting: false },
)
assert.deepEqual(
  retry.collectPermitSexRetryEvidence(['Sex F'], ['M']),
  { value: '', candidateCount: 2, conflicting: true },
)
assert.deepEqual(
  retry.collectPermitSexRetryEvidence(
    ['Sex M', '性別女'],
    [],
  ),
  { value: '', candidateCount: 2, conflicting: true },
)
assert.deepEqual(
  retry.collectPermitSexRetryEvidence(
    ['NAME FOO'],
    ['SEX F', 'TAIWAN'],
  ),
  { value: '', candidateCount: 0, conflicting: false },
)

const ocr = readFileSync('src/services/paddleOcr.ts', 'utf8')
assert.match(
  ocr,
  /OCR_PIPELINE_VERSION\s*=\s*'2026\.10\.11\.29'/,
)

const retryStart = ocr.indexOf('async function retryPermitSex(')
const retryEnd = ocr.indexOf(
  'export async function recognizeTaiwanCompatriotPermitWithPaddle(',
  retryStart,
)
assert.ok(retryStart >= 0 && retryEnd > retryStart)
const retrySource = ocr.slice(retryStart, retryEnd)
assert.equal(
  (retrySource.match(/instance\.predict/g) ?? []).length,
  1,
  'focused sex retry must perform exactly one ROI OCR',
)
assert.match(retrySource, /selectPermitSexRetryRegion/)
assert.match(retrySource, /collectPermitSexRetryEvidence/)

const mainStart = ocr.indexOf(
  'export async function recognizeTaiwanCompatriotPermitWithPaddle(',
)
const mainEnd = ocr.indexOf(
  'export type TaiwanNationalIdSex',
  mainStart,
)
assert.ok(mainStart >= 0 && mainEnd > mainStart)
const main = ocr.slice(mainStart, mainEnd)
const emptyGuard = main.indexOf("best.result.sex === ''")
const retryCall = main.indexOf('retryPermitSex(', emptyGuard)
const nameRetry = main.indexOf(
  '// A nonempty but uncertain name can be wrong.',
)
assert.ok(emptyGuard >= 0)
assert.ok(retryCall > emptyGuard)
assert.ok(nameRetry > retryCall)
assert.match(main, /selectedSource =\s*'focused-retry'/)

console.log('Permit .20 focused sex retry ROI/evidence/source guards passed')
