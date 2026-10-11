import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const dir = mkdtempSync(resolve('node_modules', '.permit-raw-name-evidence-'))
let select
try {
  const compiled = ts.transpileModule(
    readFileSync('src/services/permitRawNameEvidence.ts', 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
  ).outputText
  const file = resolve(dir, 'selector.mjs')
  writeFileSync(file, compiled)
  ;({ selectPermitRawNameCandidate: select } =
    await import(pathToFileURL(file).href))
} finally {
  rmSync(dir, { recursive: true, force: true })
}

const compatibleFar = {
  value: '甲乙丙',
  compatibility: 'compatible',
  latinDistance: 8,
  labelDistance: null,
  exactRow: true,
  officialVariantPromotion: false,
}
const unknownNear = {
  value: '丁戊己',
  compatibility: 'unknown',
  latinDistance: 1,
  labelDistance: 1,
  exactRow: true,
  officialVariantPromotion: false,
}
assert.equal(
  select([unknownNear, compatibleFar])?.value,
  '甲乙丙',
)

assert.equal(
  select([
    {
      value: '官方拼音',
      compatibility: 'compatible',
      latinDistance: 9,
      labelDistance: null,
      exactRow: true,
      officialVariantPromotion: true,
    },
  ])?.officialVariantPromotion,
  true,
)

assert.equal(
  select([
    {
      value: '衝突姓名',
      compatibility: 'conflict',
      latinDistance: 1,
      labelDistance: 0,
      exactRow: true,
      officialVariantPromotion: false,
    },
  ]),
  null,
)

assert.equal(
  select([
    {
      value: '無錨點',
      compatibility: 'unknown',
      latinDistance: 4,
      labelDistance: 5,
      exactRow: true,
      officialVariantPromotion: false,
    },
  ]),
  null,
)

assert.equal(
  select([
    {
      value: '近姓名',
      compatibility: 'unknown',
      latinDistance: null,
      labelDistance: 1,
      exactRow: true,
      officialVariantPromotion: false,
    },
  ])?.value,
  '近姓名',
)

assert.equal(
  select([
    {
      value: '標準相容',
      compatibility: 'compatible',
      latinDistance: 6,
      labelDistance: null,
      exactRow: true,
      officialVariantPromotion: false,
    },
    {
      value: '近但衝突',
      compatibility: 'conflict',
      latinDistance: 1,
      labelDistance: null,
      exactRow: true,
      officialVariantPromotion: false,
    },
  ])?.value,
  '標準相容',
)

assert.equal(select([]), null)

const ocr = readFileSync('src/services/paddleOcr.ts', 'utf8')
const rowSelectorStart = ocr.indexOf('function extractPermitChineseNameFromRows(')
const rowSelectorEnd = ocr.indexOf('function buildTaiwanCompatriotPermitResult(', rowSelectorStart)
assert.ok(rowSelectorStart >= 0 && rowSelectorEnd > rowSelectorStart)
const rowSelector = ocr.slice(rowSelectorStart, rowSelectorEnd)
assert.match(rowSelector, /selectPermitRawNameCandidate\(candidates\)/)
assert.match(rowSelector, /resolvePermitRawRomanization/)
assert.doesNotMatch(
  readFileSync('src/services/permitRawNameEvidence.ts', 'utf8'),
  /fallbackCandidates|isConservativeConflictFallback/,
)
assert.match(ocr, /OCR_PIPELINE_VERSION\s*=\s*'2026\.10\.11\.16'/)

console.log('Permit raw-row selector .15 policy and wiring tests passed')
