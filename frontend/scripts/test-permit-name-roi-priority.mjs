import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const directory = mkdtempSync(resolve('node_modules', '.permit-roi-test-'))
let choose
try {
  const source = readFileSync('src/services/permitNameCropAnchor.ts', 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText
  const filename = resolve(directory, 'permitNameCropAnchor.mjs')
  writeFileSync(filename, output)
  ;({ choosePermitNameCropAnchor: choose } = await import(pathToFileURL(filename).href))
} finally {
  rmSync(directory, { recursive: true, force: true })
}

const item = (text, score) => ({ text, score })
const latin = text => text === 'CHEN LI'
assert.equal(choose([item('Name', .99), item('姓名', .62)], latin)?.text, '姓名')
assert.equal(choose([item('姓名', .2), item('姓 名', .8)], latin)?.score, .8)
assert.equal(choose([item('Name', .5), item('CHEN LI', .99)], latin)?.text, 'Name')
assert.equal(choose([item('CHEN LI', .9)], latin)?.text, 'CHEN LI')
assert.equal(choose([item('Address', .99)], latin), null)
assert.equal(choose([], latin), null)
console.log('Permit Chinese printed name ROI anchor functional tests passed')
