import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
const dir = mkdtempSync(resolve('node_modules', '.permit-source-test-'))
let aggregate
try {
  const source = readFileSync('src/services/permitSourceEvidence.ts', 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText
  const file = resolve(dir, 'evidence.mjs')
  writeFileSync(file, compiled)
  ;({ aggregatePermitSourceEvidence: aggregate } = await import(pathToFileURL(file).href))
} finally {
  rmSync(dir, { recursive: true, force: true })
}
assert.deepEqual(aggregate([]), {
  distanceCropUsed: 0, nameRetryAccepted: 0, nameRetryConsensus: 0, mrzUsed: 0,
})
const rows = [
  { distanceCropUsed: true, nameRetryPasses: 2, nameRetryConsensus: 2, mrzUsed: false },
  { distanceCropUsed: false, nameRetryPasses: 0, nameRetryConsensus: 0, mrzUsed: true },
  { distanceCropUsed: true, nameRetryPasses: 1, nameRetryConsensus: 1, mrzUsed: true },
  null,
]
assert.deepEqual(aggregate(rows), {
  distanceCropUsed: 2, nameRetryAccepted: 2, nameRetryConsensus: 1, mrzUsed: 2,
})
const output = JSON.stringify(aggregate(rows))
for (const secret of ['姓名', '甲乙', 'trainingSampleId', 'rawRows', 'groundTruth']) {
  assert.equal(output.includes(secret), false)
}
console.log('Anonymous permit source evidence functional tests passed')
