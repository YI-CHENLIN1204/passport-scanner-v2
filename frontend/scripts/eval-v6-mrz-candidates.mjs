// Offline local-only bridge to the exact frontend production romanization comparator.
// Receives private OCR text through stdin and prints anonymous aggregate counts only.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bundled = await build({
  entryPoints: [path.join(root, 'src/services/nameRomanization.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  logLevel: 'silent',
})
const require = createRequire(import.meta.url)
const module = { exports: {} }
new Function('module', 'exports', 'require', bundled.outputFiles[0].text)(
  module, module.exports, require,
)
const { compareChineseNameToMrzRomanization } = module.exports
if (typeof compareChineseNameToMrzRomanization !== 'function') {
  throw new Error('Production comparator export unavailable')
}

const input = JSON.parse(fs.readFileSync(0, 'utf8'))
if (!Array.isArray(input) || input.length > 19) throw new Error('Invalid local cohort')
const output = { compared: 0, compatible: 0, compatible_correct: 0, compatible_wrong: 0,
  conflict: 0, unknown: 0, missing_english: 0,
  missing_cohort_compatible_correct: 0, missing_cohort_compatible_wrong: 0 }
for (const row of input) {
  if (!row || !Array.isArray(row.candidates) || row.candidates.length > 150) throw new Error('Invalid local candidates')
  const english = typeof row.ocrEnglish === 'string' ? row.ocrEnglish : ''
  // Older OCR nameEn is commonly "SURNAME, GIVEN NAMES". Never infer that an
  // unsplit joined string provides a reliable one-token-per-Han MRZ.
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
