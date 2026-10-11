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
  writeFileSync(outputPath, output
    .replace(
      "from './officialRomanizationVariants'",
      "from './officialRomanizationVariants.mjs'",
    )
    .replace(
      "from './nameRomanization'",
      "from './nameRomanization.mjs'",
    ),
  )
}

let imported
let guardedOfficialNameSuggestion
try {
  compile('src/services/officialRomanizationVariants.ts',
    resolve(temp, 'officialRomanizationVariants.mjs'))
  compile('src/services/nameRomanization.ts',
    resolve(temp, 'nameRomanization.mjs'))
  imported = await import(pathToFileURL(
    resolve(temp, 'nameRomanization.mjs')).href)
  compile('src/services/officialNameSuggestion.ts',
    resolve(temp, 'officialNameSuggestion.mjs'))
  const fallback = await import(pathToFileURL(
    resolve(temp, 'officialNameSuggestion.mjs')).href)
  guardedOfficialNameSuggestion = fallback.guardedOfficialNameSuggestion
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
const joined = imported.matchesChineseNameToJoinedRomanizationWithOfficialVariants
assert.equal(joined('王一明', 'WANG', 'IMING'), true)
assert.equal(joined('王石明', 'WANG', 'SHIHMING'), true)
assert.equal(joined('王建明', 'WANG', 'CHIENMING'), true)
assert.equal(joined('王一明', 'WANG', 'I MING'), true)
assert.equal(joined('王英明', 'WANG', 'YINMING'), false)
assert.equal(joined('王一明', 'WANG', 'IMIN'), false)
console.log('Passed exact joined-token romanization positive/negative checks.')


const mrz = { surname: 'WANG', givenNames: 'I MING' }
const confident = {
  text: '王一明', score: 0.92, rank: 2.7,
  romanizationStatus: 'conflict',
}
const ambiguous = {
  text: '王依明', score: 0.93, rank: 2.8,
  romanizationStatus: 'conflict',
}
assert.equal(guardedOfficialNameSuggestion([confident], mrz)?.text, '王一明')
assert.equal(guardedOfficialNameSuggestion(
  [{ ...confident, score: 0.77 }], mrz,
), null)
assert.equal(guardedOfficialNameSuggestion([confident, ambiguous], mrz), null)
assert.equal(guardedOfficialNameSuggestion([confident], null), null)
assert.equal(guardedOfficialNameSuggestion(
  [{ ...confident, romanizationStatus: 'compatible' }], mrz,
), null)
assert.equal(guardedOfficialNameSuggestion(
  [{ ...confident, text: '王英明' }], mrz,
), null)
console.log('Passed six guarded review-suggestion positive/negative checks.')
