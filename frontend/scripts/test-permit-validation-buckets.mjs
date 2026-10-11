import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
const dir = mkdtempSync(resolve('node_modules', '.permit-raw-buckets-'))
let classify
try {
  const source = readFileSync('src/services/permitValidationBuckets.ts', 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText
  const path = resolve(dir, 'buckets.mjs')
  writeFileSync(path, transpiled)
  ;({ classifyPermitNameRawFailure: classify } = await import(pathToFileURL(path).href))
} finally {
  rmSync(dir, { recursive: true, force: true })
}
assert.equal(classify('甲丁','甲乙',['姓名', '甲乙']), 'exact-raw-row')
assert.equal(classify('甲丁','甲乙',['姓名甲乙']), 'embedded-in-raw-row')
assert.equal(classify('甲丁','甲乙',['姓名', '甲丙']), 'not-in-selected-raw-rows')
assert.equal(classify('甲乙','甲乙',['甲丙']), null)
assert.equal(classify('','',['甲丙']), null)
assert.equal(classify('甲丁','甲乙',['姓 名 甲 乙']), 'embedded-in-raw-row')
assert.equal(classify('甲丁','甲乙',['甲乙。']), 'exact-raw-row')
const bucket = classify('甲丁','甲乙',['甲乙'])
assert.ok(!JSON.stringify(bucket).includes('甲乙'), 'diagnostic category must not leak names')
console.log('Anonymous permit selected-raw-row bucket tests passed')
