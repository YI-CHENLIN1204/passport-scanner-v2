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
  select([{
    value: '官方拼音',
    compatibility: 'compatible',
    latinDistance: 9,
    labelDistance: null,
    exactRow: true,
    officialVariantPromotion: true,
  }])?.officialVariantPromotion,
  true,
)

assert.equal(
  select([{
    value: '黏連拼音',
    compatibility: 'compatible',
    latinDistance: 9,
    labelDistance: null,
    exactRow: true,
    joinedTokenPromotion: true,
  }])?.joinedTokenPromotion,
  true,
)

const oneMismatch = {
  value: '甲乙丙',
  compatibility: 'conflict',
  latinDistance: 9,
  labelDistance: null,
  exactRow: true,
  conflictSubtype: 'one-syllable-mismatch',
}

const promoted = select([oneMismatch])
assert.equal(promoted?.value, '甲乙丙')
assert.equal(promoted?.compatibility, 'conflict')
assert.equal(promoted?.oneSyllableFallbackPromotion, true)

assert.equal(
  select([{
    ...oneMismatch,
    exactRow: false,
  }]),
  null,
)

assert.equal(
  select([{
    ...oneMismatch,
    value: '甲乙丙丁戊',
  }]),
  null,
)

assert.equal(
  select([
    oneMismatch,
    {
      value: '庚辛壬',
      compatibility: 'conflict',
      latinDistance: 8,
      labelDistance: null,
      exactRow: true,
      conflictSubtype: 'token-count-mismatch',
    },
  ]),
  null,
)

assert.equal(
  select([
    compatibleFar,
    oneMismatch,
  ])?.value,
  '甲乙丙',
)
assert.equal(
  select([
    unknownNear,
    oneMismatch,
  ])?.value,
  '丁戊己',
)

assert.equal(
  select([{
    value: '衝突姓名',
    compatibility: 'conflict',
    latinDistance: 1,
    labelDistance: 0,
    exactRow: true,
    conflictSubtype: 'token-count-mismatch',
  }]),
  null,
)

assert.equal(
  select([{
    value: '無錨點',
    compatibility: 'unknown',
    latinDistance: 4,
    labelDistance: 5,
    exactRow: true,
  }]),
  null,
)

assert.equal(
  select([{
    value: '近姓名',
    compatibility: 'unknown',
    latinDistance: null,
    labelDistance: 1,
    exactRow: true,
  }])?.value,
  '近姓名',
)

assert.equal(select([]), null)

const selectorSource =
  readFileSync('src/services/permitRawNameEvidence.ts', 'utf8')
assert.match(
  selectorSource,
  /shortExactConflicts\.length === 1/,
)
assert.match(
  selectorSource,
  /conflictSubtype === 'one-syllable-mismatch'/,
)
assert.doesNotMatch(
  selectorSource,
  /latinDistance <= \d+/,
)

const ocr = readFileSync('src/services/paddleOcr.ts', 'utf8')
const rowSelectorStart =
  ocr.indexOf('function extractPermitChineseNameFromRows(')
const rowSelectorEnd =
  ocr.indexOf('function buildTaiwanCompatriotPermitResult(', rowSelectorStart)
assert.ok(rowSelectorStart >= 0 && rowSelectorEnd > rowSelectorStart)
const rowSelector = ocr.slice(rowSelectorStart, rowSelectorEnd)
assert.match(rowSelector, /selectPermitRawNameCandidate\(candidates\)/)
assert.match(rowSelector, /resolvePermitRawRomanization/)
assert.match(rowSelector, /selectedOneSyllableFallback/)
assert.match(
  ocr,
  /OCR_PIPELINE_VERSION\s*=\s*'2026\.10\.11\.26'/,
)

console.log('Permit raw-row selector .17 conservative one-syllable fallback tests passed')
