// Local-only PP-OCRv6 evaluation using the actual frontend romanization comparator.
// Private OCR payload enters through stdin; only aggregate counts reach stdout.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bundled = await build({
  entryPoints: [path.join(root, 'src/services/nameRomanization.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
})
// Import the bundled ESM directly. Do not use a hand-rolled CommonJS
// require/new Function loader; that was fragile for bundled dependencies.
const encoded = Buffer.from(bundled.outputFiles[0].text, 'utf8').toString('base64')
const { compareChineseNameToMrzRomanization } =
  await import('data:text/javascript;base64,' + encoded)
if (typeof compareChineseNameToMrzRomanization !== 'function') {
  throw new Error('Production comparator export unavailable')
}
if (process.argv.includes('--self-test')) {
  const positive = compareChineseNameToMrzRomanization('林奕辰', 'LIN', 'YI CHEN')
  const negative = compareChineseNameToMrzRomanization('王大明', 'LIN', 'YI CHEN')
  if (positive !== 'compatible' || negative === 'compatible') {
    throw new Error('Production comparator self-test failed')
  }
  process.stdout.write('v6 MRZ comparator bridge self-test passed\n')
  process.exit(0)
}
const input = JSON.parse(fs.readFileSync(0, 'utf8'))
if (!Array.isArray(input) || input.length > 19) throw new Error('Invalid local cohort')
const output = {
  compared: 0, compatible: 0, compatible_correct: 0, compatible_wrong: 0,
  conflict: 0, unknown: 0, missing_english: 0,
  missing_cohort_compatible_correct: 0, missing_cohort_compatible_wrong: 0,
}
for (const row of input) {
  if (!row || !Array.isArray(row.candidates) || row.candidates.length > 150) {
    throw new Error('Invalid local candidates')
  }
  const english = typeof row.ocrEnglish === 'string' ? row.ocrEnglish : ''
  const match = /^\s*([A-Za-z' -]+),\s*([A-Za-z' -]+)\s*$/.exec(english)
  if (!match) { output.missing_english++; continue }
  output.compared++
  const matches = [...new Set(row.candidates.filter(c => typeof c === 'string'))]
    .filter(c => compareChineseNameToMrzRomanization(c, match[1], match[2]) === 'compatible')
  if (matches.length === 1) {
    output.compatible++
    if (matches[0] === row.truth) {
      output.compatible_correct++
      if (row.confirmedMiss) output.missing_cohort_compatible_correct++
    } else {
      output.compatible_wrong++
      if (row.confirmedMiss) output.missing_cohort_compatible_wrong++
    }
  } else if (matches.length > 1) output.conflict++
  else output.unknown++
}
process.stdout.write(JSON.stringify(output) + '\n')
