import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

// Execute the real TS implementation without copying its selection rules.
const directory = mkdtempSync(resolve('node_modules', '.permit-evidence-test-'))
let helpers
let retryPolicy
try {
  const source = readFileSync('src/services/permitFieldEvidence.ts', 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText
  const built = resolve(directory, 'permitFieldEvidence.mjs')
  writeFileSync(built, output)
  helpers = await import(pathToFileURL(built).href)
  const retrySource = readFileSync('src/services/permitNameRetryPolicy.ts', 'utf8')
  const retryCode = ts.transpileModule(retrySource, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText
  const retryBuilt = resolve(directory, 'permitNameRetryPolicy.mjs')
  writeFileSync(retryBuilt, retryCode)
  retryPolicy = await import(pathToFileURL(retryBuilt).href)
} finally {
  rmSync(directory, { recursive: true, force: true })
}

const { selectPermitNameCandidate, selectPermitSexCandidate, selectPermitSexEvidence, selectPermitMrzVsVisualName } = helpers
const label = { value: '甲乙', score: 0.94, rank: 2.9 }
const phonetic = { value: '丙丁', score: 0.91, rank: 3.4 }
assert.equal(selectPermitNameCandidate(label, [], false, false)?.value, '甲乙')
assert.equal(selectPermitNameCandidate(label, [], true, false)?.value, '甲乙')
assert.equal(selectPermitNameCandidate(
  { ...label, score: 0.75 }, [], true, false,
), null)
assert.equal(selectPermitNameCandidate(label, [], true, true), null)
assert.equal(selectPermitNameCandidate(label, [phonetic], true, true)?.value, '丙丁')
assert.equal(selectPermitNameCandidate(null, [], true, false), null)

assert.equal(selectPermitSexCandidate('M', true, 'F', 0.94, 'F'), 'F')
assert.equal(selectPermitSexCandidate('M', false, 'F', 0.94, 'F'), 'F')
assert.equal(selectPermitSexCandidate('M', false, 'F', 0.72, 'F'), 'F')
assert.equal(selectPermitSexCandidate('M', false, 'F', 0.94, 'M'), 'M')
assert.equal(selectPermitSexCandidate('', false, 'F', 0.94, 'F'), 'F')
assert.equal(selectPermitSexCandidate('', false, '', null, 'M'), 'M')
assert.equal(selectPermitSexCandidate('', false, '', null, ''), '')
assert.equal(selectPermitSexCandidate('M', true, 'F', 0.88, 'F'), 'F')
assert.equal(selectPermitSexCandidate('M', true, 'F', 0.97, 'M'), 'M')
assert.equal(selectPermitSexCandidate('M', true, 'F', 0.98, ''), 'M')
// A weak printed label alone does not beat MRZ; direct same-row sex evidence does.
assert.equal(selectPermitSexCandidate('M', true, 'F', 0.72, ''), 'M')

assert.equal(selectPermitSexCandidate('M', true, '', null, 'F'), 'F')
assert.deepEqual(
  selectPermitSexEvidence('M', true, '', null, 'F'),
  { value: 'F', source: 'semantic-row' },
)
assert.deepEqual(
  selectPermitSexEvidence('F', true, '', null, 'F'),
  { value: 'F', source: 'mrz' },
)
assert.deepEqual(
  selectPermitSexEvidence('M', true, '', null, ''),
  { value: 'M', source: 'mrz' },
)
assert.deepEqual(
  selectPermitSexEvidence('', false, '', null, 'F'),
  { value: 'F', source: 'semantic' },
)

assert.equal(
  selectPermitSexCandidate('', false, '', null, '', 'F'),
  'F',
)
assert.deepEqual(
  selectPermitSexEvidence('', false, '', null, '', 'F'),
  { value: 'F', source: 'standalone-token' },
)
assert.deepEqual(
  selectPermitSexEvidence('M', false, '', null, '', 'F'),
  { value: 'M', source: 'mrz' },
)
assert.deepEqual(
  selectPermitSexEvidence('', false, 'M', 0.7, '', 'F'),
  { value: 'M', source: 'label' },
)
assert.deepEqual(
  selectPermitSexEvidence('', false, '', null, 'M', 'F'),
  { value: 'M', source: 'semantic' },
)

assert.deepEqual(
  selectPermitMrzVsVisualName('甲乙', '丙丁', 'compatible', '丙丁', 0.93),
  { value: '丙丁', source: 'visual-agreement' },
)
assert.deepEqual(
  selectPermitMrzVsVisualName('甲乙', '丙丁', 'compatible', '丙丁', 0.7),
  { value: '甲乙', source: 'mrz' },
)
assert.deepEqual(
  selectPermitMrzVsVisualName('甲乙', '丙丁', 'unknown', '丙丁', 0.93),
  { value: '甲乙', source: 'mrz' },
)
assert.deepEqual(
  selectPermitMrzVsVisualName('甲乙', '丙丁', 'compatible', '甲乙', 0.93),
  { value: '甲乙', source: 'mrz' },
)
assert.deepEqual(
  selectPermitMrzVsVisualName('', '丙丁', 'compatible', '丙丁', 0.93),
  { value: '丙丁', source: 'visual-agreement' },
)
assert.deepEqual(
  selectPermitMrzVsVisualName('', '丙丁', 'unknown', '甲乙', 0.93),
  { value: '丙丁', source: 'row' },
)

const { shouldRetryUncertainPermitName, shouldUseRetriedPermitName } = retryPolicy
assert.equal(shouldRetryUncertainPermitName('', null, false), true)
assert.equal(shouldRetryUncertainPermitName('甲乙', 0.81, false), true)
assert.equal(shouldRetryUncertainPermitName('甲乙', null, false), false)
assert.equal(shouldRetryUncertainPermitName('甲乙', 0.96, false), false)
assert.equal(shouldRetryUncertainPermitName('甲乙', 0.81, true), false)
const consensus = { value: '丙丁', score: 0.94, confidence: 0.96, consensus: 2 }
assert.equal(shouldUseRetriedPermitName('', null, consensus), true)
assert.equal(shouldUseRetriedPermitName('甲乙', 0.81, consensus), true)
assert.equal(shouldUseRetriedPermitName('甲乙', null, consensus), false)
assert.equal(shouldUseRetriedPermitName('甲乙', 0.94, consensus), false)
assert.equal(shouldUseRetriedPermitName('甲乙', 0.81, { ...consensus, consensus: 1 }), false)
assert.equal(shouldUseRetriedPermitName('甲乙', 0.81, { ...consensus, score: 0.75 }), false)
assert.equal(shouldUseRetriedPermitName('丙丁', 0.81, consensus), false)
assert.equal(shouldUseRetriedPermitName('甲乙', 0.81, null), false)

console.log('Passed permit field, sex evidence, MRZ cross-check and retry guards.')
