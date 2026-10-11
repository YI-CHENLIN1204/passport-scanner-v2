import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const dir = mkdtempSync(resolve('node_modules', '.permit-sex-diagnostics-'))
let aggregate
let extractSemantic
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

const rows = [
  {
    mrzSex: 'M',
    mrzRequiredValid: true,
    labeledSex: '',
    labeledScore: null,
    semanticSex: 'F',
    selectedSource: 'semantic-row',
  },
  {
    mrzSex: 'F',
    mrzRequiredValid: true,
    labeledSex: 'F',
    labeledScore: 0.95,
    semanticSex: 'F',
    selectedSource: 'visual-agreement',
  },
  {
    mrzSex: 'M',
    mrzRequiredValid: false,
    labeledSex: '',
    labeledScore: null,
    semanticSex: '',
    selectedSource: 'mrz',
  },
  {
    mrzSex: '',
    mrzRequiredValid: false,
    labeledSex: '',
    labeledScore: null,
    semanticSex: 'M',
    selectedSource: 'semantic',
  },
]

assert.deepEqual(aggregate(rows), {
  samplesWithMrzSex: 3,
  samplesWithLabeledSex: 1,
  samplesWithSemanticSex: 3,
  mrzSemanticConflict: 1,
  requiredValidMrzSemanticConflict: 1,
  selectedVisualAgreement: 1,
  selectedSemanticRow: 1,
  selectedMrz: 1,
  selectedLabel: 0,
  selectedSemantic: 1,
  selectedEmpty: 0,
})

const safe = JSON.stringify(aggregate(rows))
for (const secret of ['name', '姓名', 'rawRows', 'sampleId', 'documentNumber']) {
  assert.equal(safe.includes(secret), false)
}

const ocr = readFileSync('src/services/paddleOcr.ts', 'utf8')
assert.match(ocr, /extractPermitSemanticSexFromRows\(rawRows\)/)
assert.match(ocr, /OCR_PIPELINE_VERSION\s*=\s*'2026\.10\.11\.18'/)

const page = readFileSync('src/views/OcrQualityPage.vue', 'utf8')
assert.match(page, /permitSexEvidenceCounts/)
assert.match(page, /selectedSemanticRow/)
assert.match(page, /mrzSemanticConflict/)

console.log('Permit same-row sex semantics, selector diagnostics and Validation wiring tests passed')
