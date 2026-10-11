import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const dir = mkdtempSync(resolve('node_modules', '.permit-latin-name-'))
let parse
try {
  const compiled = ts.transpileModule(
    readFileSync('src/services/permitLatinName.ts', 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
  ).outputText
  const file = resolve(dir, 'permitLatinName.mjs')
  writeFileSync(file, compiled)
  ;({ extractPermitLatinName: parse } = await import(pathToFileURL(file).href))
} finally {
  rmSync(dir, { recursive: true, force: true })
}

assert.deepEqual(parse('Name LIN YI CHEN'), {
  surname: 'LIN',
  givenNames: 'YI CHEN',
})
assert.deepEqual(parse('NAME CHEN, YI-CHEN'), {
  surname: 'CHEN',
  givenNames: 'YI-CHEN',
})
assert.deepEqual(parse('LIN YI CHEN'), {
  surname: 'LIN',
  givenNames: 'YI CHEN',
})
assert.equal(parse('SEX LIN YI'), null)
assert.equal(parse('TAIWAN RESIDENT PERMIT'), null)
assert.equal(parse('NAME'), null)
assert.equal(parse('LIN'), null)

const ocr = readFileSync('src/services/paddleOcr.ts', 'utf8')
assert.match(ocr, /extractPermitLatinName, type PermitLatinName/)
assert.match(ocr, /OCR_PIPELINE_VERSION\s*=\s*'2026\.10\.11\.17'/)
console.log('Permit Latin-name label parsing and wiring tests passed')
