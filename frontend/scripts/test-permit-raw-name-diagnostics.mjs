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
    labelRowCount: 0,
    candidateCount: 3,
    compatibleCandidateCount: 1,
    unknownCandidateCount: 0,
    conflictCandidateCount: 2,
    officialVariantCandidateCount: 1,
    selectedOfficialVariant: true,
    joinedTokenCandidateCount: 0,
    selectedJoinedToken: false,
    oneSyllableFallbackEligibleCount: 1,
    selectedOneSyllableFallback: false,
    conflictTokenCountMismatchCandidateCount: 0,
    conflictOneSyllableMismatchCandidateCount: 1,
    conflictOtherMismatchCandidateCount: 0,
    conflictUnclassifiedCandidateCount: 0,
    shortExactConflictCandidateCount: 1,
    nearestConflictLatinDistance: 6,
    selectedCompatibility: 'compatible',
  },
  {
    latinRowCount: 1,
    labelRowCount: 0,
    candidateCount: 1,
    compatibleCandidateCount: 0,
    unknownCandidateCount: 0,
    conflictCandidateCount: 1,
    officialVariantCandidateCount: 0,
    selectedOfficialVariant: false,
    joinedTokenCandidateCount: 0,
    selectedJoinedToken: false,
    oneSyllableFallbackEligibleCount: 0,
    selectedOneSyllableFallback: false,
    conflictTokenCountMismatchCandidateCount: 1,
    conflictOneSyllableMismatchCandidateCount: 0,
    conflictOtherMismatchCandidateCount: 0,
    conflictUnclassifiedCandidateCount: 0,
    shortExactConflictCandidateCount: 1,
    nearestConflictLatinDistance: 3,
    selectedCompatibility: null,
  },
  {
    latinRowCount: 1,
    labelRowCount: 0,
    candidateCount: 1,
    compatibleCandidateCount: 0,
    unknownCandidateCount: 1,
    conflictCandidateCount: 0,
    officialVariantCandidateCount: 0,
    selectedOfficialVariant: false,
    joinedTokenCandidateCount: 0,
    selectedJoinedToken: false,
    oneSyllableFallbackEligibleCount: 0,
    selectedOneSyllableFallback: false,
    conflictTokenCountMismatchCandidateCount: 0,
    conflictOneSyllableMismatchCandidateCount: 0,
    conflictOtherMismatchCandidateCount: 0,
    conflictUnclassifiedCandidateCount: 0,
    shortExactConflictCandidateCount: 0,
    nearestConflictLatinDistance: null,
    selectedCompatibility: 'unknown',
  },
  {
    latinRowCount: 1,
    labelRowCount: 0,
    candidateCount: 1,
    compatibleCandidateCount: 1,
    unknownCandidateCount: 0,
    conflictCandidateCount: 0,
    officialVariantCandidateCount: 0,
    selectedOfficialVariant: false,
    joinedTokenCandidateCount: 1,
    selectedJoinedToken: true,
    oneSyllableFallbackEligibleCount: 0,
    selectedOneSyllableFallback: false,
    conflictTokenCountMismatchCandidateCount: 0,
    conflictOneSyllableMismatchCandidateCount: 0,
    conflictOtherMismatchCandidateCount: 0,
    conflictUnclassifiedCandidateCount: 0,
    shortExactConflictCandidateCount: 0,
    nearestConflictLatinDistance: null,
    selectedCompatibility: 'compatible',
  },
  {
    latinRowCount: 1,
    labelRowCount: 0,
    candidateCount: 1,
    compatibleCandidateCount: 0,
    unknownCandidateCount: 0,
    conflictCandidateCount: 1,
    officialVariantCandidateCount: 0,
    selectedOfficialVariant: false,
    joinedTokenCandidateCount: 0,
    selectedJoinedToken: false,
    oneSyllableFallbackEligibleCount: 1,
    selectedOneSyllableFallback: true,
    conflictTokenCountMismatchCandidateCount: 0,
    conflictOneSyllableMismatchCandidateCount: 1,
    conflictOtherMismatchCandidateCount: 0,
    conflictUnclassifiedCandidateCount: 0,
    shortExactConflictCandidateCount: 1,
    nearestConflictLatinDistance: 7,
    selectedCompatibility: 'conflict',
  },
]

assert.deepEqual(aggregate(rows), {
  samplesWithLatinRows: 5,
  samplesWithLabelRows: 0,
  samplesWithCompatibleCandidate: 2,
  samplesWithUnknownCandidate: 1,
  samplesWithConflictCandidate: 3,
  samplesWithOfficialVariantCandidate: 1,
  selectedOfficialVariant: 1,
  samplesWithJoinedTokenCandidate: 1,
  selectedJoinedToken: 1,
  samplesWithOneSyllableFallbackEligible: 2,
  selectedOneSyllableFallback: 1,
  samplesWithConflictTokenCountMismatch: 1,
  samplesWithConflictOneSyllableMismatch: 2,
  samplesWithConflictOtherMismatch: 0,
  samplesWithConflictUnclassified: 0,
  samplesWithShortExactConflictCandidate: 3,
  samplesConflictDistanceLe2: 0,
  samplesConflictDistance3To4: 1,
  samplesConflictDistance5Plus: 2,
  totalCandidates: 7,
  selectedCompatible: 2,
  selectedUnknown: 1,
  selectedNone: 1,
})

const safe = JSON.stringify(aggregate(rows))
for (const secret of ['姓名', '甲乙', 'rawRows', 'groundTruth', 'sampleId']) {
  assert.equal(safe.includes(secret), false)
}

const page = readFileSync('src/views/OcrQualityPage.vue', 'utf8')
assert.match(
  page,
  /aggregatePermitRawNameEvidence\(rows\.map\(row => row\.permitRawNameEvidence\)\)/,
)
assert.match(page, /samplesWithOfficialVariantCandidate/)
assert.match(page, /selectedOfficialVariant/)
assert.match(page, /samplesWithJoinedTokenCandidate/)
assert.match(page, /selectedJoinedToken/)
assert.match(page, /samplesWithOneSyllableFallbackEligible/)
assert.match(page, /selectedOneSyllableFallback/)
assert.doesNotMatch(
  page,
  /selectedConflictFallback|samplesWithEligibleConflictFallback/,
)

console.log('Permit raw-name .17 diagnostics aggregation and wiring tests passed')
