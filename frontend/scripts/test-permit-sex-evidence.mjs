import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const dir = mkdtempSync(resolve('node_modules', '.permit-sex-diagnostics-'))
let aggregate
let extractSemantic
let collectStandalone
try {
  const compiled = ts.transpileModule(
    readFileSync('src/services/permitSexDiagnostics.ts', 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
  ).outputText
  const file = resolve(dir, 'permitSexDiagnostics.mjs')
  writeFileSync(file, compiled)
  ;({ aggregatePermitSexEvidence: aggregate } =
    await import(pathToFileURL(file).href))
  const semanticCompiled = ts.transpileModule(
    readFileSync('src/services/permitSexSemantics.ts', 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
  ).outputText
  const semanticFile = resolve(dir, 'permitSexSemantics.mjs')
  writeFileSync(semanticFile, semanticCompiled)
  ;({ extractPermitSemanticSexFromRows: extractSemantic } =
    await import(pathToFileURL(semanticFile).href))
  const standaloneCompiled = ts.transpileModule(
    readFileSync('src/services/permitStandaloneSexEvidence.ts', 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
  ).outputText
  const standaloneFile = resolve(dir, 'permitStandaloneSexEvidence.mjs')
  writeFileSync(standaloneFile, standaloneCompiled)
  ;({ collectStandalonePermitSexEvidence: collectStandalone } =
    await import(pathToFileURL(standaloneFile).href))
} finally {
  rmSync(dir, { recursive: true, force: true })
}

assert.equal(extractSemantic(['性別女']), 'F')
assert.equal(extractSemantic(['女性別']), 'F')
assert.equal(extractSemantic(['Sex F']), 'F')
assert.equal(extractSemantic(['性别男']), 'M')
assert.equal(extractSemantic(['男性別']), 'M')
assert.equal(extractSemantic(['Sex M']), 'M')
assert.equal(extractSemantic(['女', '性別']), '')
assert.equal(extractSemantic(['M', 'Sex']), '')
assert.equal(extractSemantic(['NAME FOO']), '')
assert.equal(extractSemantic([]), '')

assert.deepEqual(
  collectStandalone(['姓名', '女', '出生日期']),
  { value: 'F', tokenCount: 1, conflicting: false },
)
assert.deepEqual(
  collectStandalone(['M', '姓名']),
  { value: 'M', tokenCount: 1, conflicting: false },
)
assert.deepEqual(
  collectStandalone(['M', 'F']),
  { value: '', tokenCount: 2, conflicting: true },
)
assert.deepEqual(
  collectStandalone(['SEX F', '女性別']),
  { value: '', tokenCount: 0, conflicting: false },
)
assert.deepEqual(
  collectStandalone([]),
  { value: '', tokenCount: 0, conflicting: false },
)

const rows = [
  {
    mrzSex: 'M',
    mrzRequiredValid: true,
    labeledSex: '',
    labeledScore: null,
    semanticSex: 'F',
    standaloneSex: '',
    standaloneTokenCount: 0,
    standaloneTokenConflict: false,
    selectedSource: 'semantic-row',
  },
  {
    mrzSex: 'F',
    mrzRequiredValid: true,
    labeledSex: 'F',
    labeledScore: 0.95,
    semanticSex: 'F',
    standaloneSex: '',
    standaloneTokenCount: 0,
    standaloneTokenConflict: false,
    selectedSource: 'visual-agreement',
  },
  {
    mrzSex: 'M',
    mrzRequiredValid: false,
    labeledSex: '',
    labeledScore: null,
    semanticSex: '',
    standaloneSex: '',
    standaloneTokenCount: 0,
    standaloneTokenConflict: false,
    selectedSource: 'mrz',
  },
  {
    mrzSex: '',
    mrzRequiredValid: false,
    labeledSex: '',
    labeledScore: null,
    semanticSex: 'M',
    standaloneSex: '',
    standaloneTokenCount: 0,
    standaloneTokenConflict: false,
    selectedSource: 'semantic',
  },
  {
    mrzSex: '',
    mrzRequiredValid: false,
    labeledSex: '',
    labeledScore: null,
    semanticSex: '',
    standaloneSex: 'F',
    standaloneTokenCount: 1,
    standaloneTokenConflict: false,
    selectedSource: 'standalone-token',
  },
]

assert.deepEqual(aggregate(rows), {
  samplesWithMrzSex: 3,
  samplesWithLabeledSex: 1,
  samplesWithSemanticSex: 3,
  samplesWithStandaloneSexToken: 1,
  samplesWithStandaloneTokenConflict: 0,
  mrzSemanticConflict: 1,
  requiredValidMrzSemanticConflict: 1,
  selectedVisualAgreement: 1,
  selectedSemanticRow: 1,
  selectedMrz: 1,
  selectedLabel: 0,
  selectedSemantic: 1,
  selectedStandaloneToken: 1,
  selectedEmpty: 0,
})

const safe = JSON.stringify(aggregate(rows))
for (const secret of ['name', '姓名', 'rawRows', 'sampleId', 'documentNumber']) {
  assert.equal(safe.includes(secret), false)
}

const ocr = readFileSync('src/services/paddleOcr.ts', 'utf8')
assert.match(ocr, /extractPermitSemanticSexFromRows\(rawRows\)/)
assert.match(ocr, /collectStandalonePermitSexEvidence/)
assert.match(ocr, /OCR_PIPELINE_VERSION\s*=\s*'2026\.10\.11\.19'/)

const page = readFileSync('src/views/OcrQualityPage.vue', 'utf8')
assert.match(page, /permitSexEvidenceCounts/)
assert.match(page, /selectedSemanticRow/)
assert.match(page, /selectedStandaloneToken/)
assert.match(page, /mrzSemanticConflict/)

console.log('Permit same-row sex semantics, selector diagnostics and Validation wiring tests passed')
