import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import ts from 'typescript'

// Compile actual TypeScript with the project's existing TypeScript dependency.
const temp = mkdtempSync(resolve('node_modules', '.romanization-test-'))
function compile(inputPath, outputPath) {
  const source = readFileSync(inputPath, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
    fileName: inputPath,
  }).outputText
  writeFileSync(outputPath, output.replace(
    "from './officialRomanizationVariants'",
    "from './officialRomanizationVariants.mjs'",
  ))
}

let imported
try {
  compile('src/services/officialRomanizationVariants.ts',
    resolve(temp, 'officialRomanizationVariants.mjs'))
  compile('src/services/nameRomanization.ts',
    resolve(temp, 'nameRomanization.mjs'))
  imported = await import(pathToFileURL(
    resolve(temp, 'nameRomanization.mjs')).href)
} finally {
  rmSync(temp, { recursive: true, force: true })
}
const production = imported.compareChineseNameToMrzRomanization
const official = imported.compareChineseNameToMrzWithOfficialVariants
const cases = [
  { name: '王一明', surname: 'WANG', given: 'I MING', original: 'conflict', official: 'compatible' },
  { name: '王石明', surname: 'WANG', given: 'SHIH MING', original: 'conflict', official: 'compatible' },
  { name: '王建明', surname: 'WANG', given: 'CHIEN MING', original: 'conflict', official: 'compatible' },
  { name: '王清明', surname: 'WANG', given: 'CING MING', original: 'conflict', official: 'compatible' },
  { name: '王秋明', surname: 'WANG', given: 'CIOU MING', original: 'conflict', official: 'compatible' },
  { name: '王英明', surname: 'WANG', given: 'YIN MING', original: 'conflict', official: 'conflict' },
  { name: '王一明', surname: 'WANG', given: 'YI MING', original: 'compatible', official: 'compatible' },
  { name: '王一明', surname: 'WANG', given: 'I', original: 'conflict', official: 'conflict' },
]
for (const entry of cases) {
  assert.equal(
    production(entry.name, entry.surname, entry.given),
    entry.original,
    'Production compatibility changed: ' + entry.name,
  )
  assert.equal(
    official(entry.name, entry.surname, entry.given),
    entry.official,
    'BOCA shadow mismatch: ' + entry.name,
  )
}
console.log('Passed ' + cases.length + ' synthetic romanization cases.')
