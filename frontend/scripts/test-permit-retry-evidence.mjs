import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const dir = mkdtempSync(resolve('node_modules', '.permit-retry-evidence-'))
let select
try {
  const compiled = ts.transpileModule(
    readFileSync('src/services/permitNameRetryEvidence.ts', 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
  ).outputText
  const file = resolve(dir, 'evidence.mjs')
  writeFileSync(file, compiled)
  ;({ selectPermitRetryWinner: select } = await import(pathToFileURL(file).href))
} finally {
  rmSync(dir, { recursive: true, force: true })
}

assert.equal(select([], 0), null)
const sameRegion = select([
  { value: '甲乙', score: 0.91, region: 'anchored' },
  { value: '甲乙', score: 0.93, region: 'anchored' },
], 2)
assert.equal(sameRegion.consensus, 1)
assert.equal(sameRegion.passes, 2)

const independent = select([
  { value: '甲乙', score: 0.90, region: 'anchored' },
  { value: '甲乙', score: 0.92, region: 'broad' },
  { value: '丙丁', score: 0.98, region: 'anchored' },
], 3)
assert.equal(independent.value, '甲乙')
assert.equal(independent.consensus, 2)
assert.ok(independent.confidence >= 0.96)
assert.equal(independent.passes, 3)

console.log('Permit retry independent-region evidence tests passed')
