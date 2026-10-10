import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

// Execute the real TS implementation without copying its selection rules.
const directory = mkdtempSync(resolve('node_modules', '.permit-evidence-test-'))
let helpers
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
} finally {
  rmSync(directory, { recursive: true, force: true })
}

const { selectPermitNameCandidate, selectPermitSexCandidate } = helpers
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

assert.equal(selectPermitSexCandidate('M', true, 'F', 0.94, 'F'), 'M')
assert.equal(selectPermitSexCandidate('M', false, 'F', 0.94, 'F'), 'F')
assert.equal(selectPermitSexCandidate('M', false, 'F', 0.72, 'F'), 'M')
assert.equal(selectPermitSexCandidate('M', false, 'F', 0.94, 'M'), 'M')
assert.equal(selectPermitSexCandidate('', false, 'F', 0.94, 'F'), 'F')
assert.equal(selectPermitSexCandidate('', false, '', null, 'M'), 'M')
assert.equal(selectPermitSexCandidate('', false, '', null, ''), '')

console.log('Passed 13 synthetic permit name/sex evidence guards.')
