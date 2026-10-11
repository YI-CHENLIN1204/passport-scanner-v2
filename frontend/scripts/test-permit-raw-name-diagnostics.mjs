import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const dir = mkdtempSync(resolve('node_modules', '.permit-raw-name-diagnostics-'))
let aggregate
try {
  const compiled = ts.transpileModule(
    readFileSync('src/services/permitRawNameDiagnostics.ts', 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
  ).outputText
  const file = resolve(dir, 'diagnostics.mjs')
  writeFileSync(file, compiled)
  ;({ aggregatePermitRawNameEvidence: aggregate } =
    await import(pathToFileURL(file).href))
} finally {
  rmSync(dir, { recursive: true, force: true })
}

const rows = [
  {
    latinRowCount: 1,
    labelRowCount: 1,
    candidateCount: 3,
    compatibleCandidateCount: 1,
    unknownCandidateCount: 1,
    conflictCandidateCount: 1,
    selectedCompatibility: 'compatible',
  },
  {
    latinRowCount: 0,
    labelRowCount: 1,
    candidateCount: 1,
    compatibleCandidateCount: 0,
    unknownCandidateCount: 1,
    conflictCandidateCount: 0,
    selectedCompatibility: 'unknown',
  },
  {
    latinRowCount: 0,
    labelRowCount: 0,
    candidateCount: 0,
    compatibleCandidateCount: 0,
    unknownCandidateCount: 0,
    conflictCandidateCount: 0,
    selectedCompatibility: null,
  },
]
assert.deepEqual(aggregate(rows), {
  samplesWithLatinRows: 1,
  samplesWithLabelRows: 2,
  samplesWithCompatibleCandidate: 1,
  samplesWithUnknownCandidate: 2,
  samplesWithConflictCandidate: 1,
  totalCandidates: 4,
  selectedCompatible: 1,
  selectedUnknown: 1,
  selectedConflictFallback: 0,
  selectedNone: 1,
})
const safe = JSON.stringify(aggregate(rows))
for (const secret of ['姓名', '甲乙', 'rawRows', 'groundTruth', 'sampleId']) {
  assert.equal(safe.includes(secret), false)
}

const page = readFileSync('src/views/OcrQualityPage.vue', 'utf8')
assert.match(page, /aggregatePermitRawNameEvidence\(rows\.map\(row => row\.permitRawNameEvidence\)\)/)
assert.match(page, /result\.permitRawNameEvidenceCounts\.samplesWithLatinRows/)
console.log('Permit raw-name diagnostics aggregation and wiring tests passed')
