import assert from 'node:assert/strict'
import { build } from 'esbuild'

// Bundle the real TypeScript module: no duplicated mock of OCR rules.
const { outputFiles } = await build({
  entryPoints: ['src/services/nameRomanization.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
})
const code = outputFiles[0].text
const imported = await import(
  'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
)
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
