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
  latinDistance: 4,
  labelDistance: 4,
  exactRow: true,
}
const unknownNear = {
  value: '丁戊己',
  compatibility: 'unknown',
  latinDistance: 1,
  labelDistance: 1,
  exactRow: true,
}
assert.equal(
  select([unknownNear, compatibleFar])?.value,
  '甲乙丙',
)

assert.equal(
  select([
    {
      value: '錯誤名',
      compatibility: 'conflict',
      latinDistance: 0,
      labelDistance: 0,
      exactRow: true,
    },
    unknownNear,
  ])?.value,
  '丁戊己',
)

assert.equal(
  select([
    {
      value: '無錨點',
      compatibility: 'unknown',
      latinDistance: 4,
      labelDistance: 5,
      exactRow: true,
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
    },
  ])?.value,
  '近姓名',
)

assert.equal(select([]), null)

const ocr = readFileSync('src/services/paddleOcr.ts', 'utf8')
const rowSelectorStart = ocr.indexOf('function extractPermitChineseNameFromRows(')
const rowSelectorEnd = ocr.indexOf('function buildTaiwanCompatriotPermitResult(', rowSelectorStart)
assert.ok(rowSelectorStart >= 0 && rowSelectorEnd > rowSelectorStart)
const rowSelector = ocr.slice(rowSelectorStart, rowSelectorEnd)
assert.match(rowSelector, /selectPermitRawNameCandidate\(candidates\)/)
assert.doesNotMatch(rowSelector, /offset <= 2/)
assert.match(ocr, /OCR_PIPELINE_VERSION\s*=\s*'2026\.10\.11\.11'/)

console.log('Permit raw-row name evidence ranking and wiring tests passed')
