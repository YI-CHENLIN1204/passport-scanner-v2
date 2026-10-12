import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

// Exercise the ACTUAL production selector with synthetic OCR geometry.
// Keep only its module-local helpers mocked, not a reimplementation
// of the joined-box algorithm.
const source = readFileSync('src/services/paddleOcr.ts', 'utf8')
const start = source.indexOf('function chooseTaiwanChineseName(')
const end = source.indexOf('function scoreValidation(', start)
assert.ok(start >= 0 && end > start)
const functionSource = source.slice(start, end)
const js = ts.transpileModule(functionSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  reportDiagnostics: true,
})
assert.equal(js.diagnostics?.length ?? 0, 0)

const normalized = value => value.replace(/\s+/g, '').trim()
const compare = (name, surname, given) => {
  const allowed = new Map([
    ['林', 'LIN'], ['奕', 'YI'], ['辰', 'CHEN'],
    ['王', 'WANG'], ['大', 'DA'], ['明', 'MING'],
  ])
  const syllables = Array.from(name).map(char => allowed.get(char))
  return syllables.length && syllables.every(Boolean) &&
    syllables.join('') === (surname + given).replace(/[^a-z]/gi, '').toUpperCase()
      ? 'compatible' : 'conflict'
}
const context = {
  toGeometry: item => item,
  normalizeChineseNameCandidate: normalized,
  isPlausibleTaiwanChineseName: value => /^[\p{Script=Han}]{2,12}$/u.test(value),
  normalizeLatinNameForMatch: value => value.toUpperCase().replace(/[^A-Z]/g, ''),
  compareChineseNameToMrzRomanization: compare,
  compareChineseNameToMrzWithOfficialVariants: compare,
  classifyRomanizationConflict: () => 'other-mismatch',
  evaluatePassportOneSyllableShadow: () => ({decision:'no-candidate',text:null}),
  guardedOfficialNameSuggestion: () => null,
}
const select = vm.runInNewContext(js.outputText + '\nchooseTaiwanChineseName', context)
const box = (text, x, y, score=0.96) => ({
  text, score, rawText:text, normalized:text,
  minX:x, maxX:x+18, centerX:x+9,
  minY:y, maxY:y+22, centerY:y+11, height:22,
  points:[[x,y],[x+18,y],[x+18,y+22],[x,y+22]],
})
const mrz = {surname:'LIN',givenNames:'YI CHEN'}
const label = box('姓名',0,15)
const first = box('林',65,15)
const second = box('奕辰',84,15)
function choose(items, reference=mrz) {
  return select(items,reference)
}

assert.equal(choose([label,first,second])?.text, '林奕辰',
  'adjacent boxes must be recoverable with exact MRZ phonetics')
assert.equal(choose([label,first,{...second,score:0.80}]), null,
  'weak recognition evidence cannot trigger a join')
assert.equal(choose([label,first,box('奕辰',140,15)]), null,
  'distant boxes cannot be joined')
assert.equal(choose([label,first,box('奕辰',84,50)]), null,
  'off-row boxes cannot be joined')
assert.equal(choose([label,first,second],{surname:'LIN',givenNames:'YI MING'}),null,
  'phonetic conflict must not be relaxed')
assert.equal(choose([first,second]),null,
  'unanchored name fragments must not be joined')

// Existing unambiguous full-box candidate must keep priority.
const whole = box('林奕辰',65,15)
assert.equal(choose([label,whole,first,second])?.text,'林奕辰')
console.log('Production joined-Han selector synthetic functional cases passed')
