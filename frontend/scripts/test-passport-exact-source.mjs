import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync('src/views/OcrQualityPage.vue','utf8')
assert.match(page, /passportExactDecisionSource: string \| null/)
assert.match(page, /source: group\.source/)
assert.match(page, /passportExactDecisionSource = passportExactDecision/)
assert.match(page, /passportExactDecisionSource,\s*passportShadow/)
assert.match(page, /passportDecisionSourceCounts:/)
assert.match(page, /result\.passportDecisionSourceCounts\.length/)
const section=page.slice(page.indexOf('const passportExactDecisionSource = '),page.indexOf('// Compare outcomes only;'))
assert.ok(section.includes("?? 'untraced'"))
assert.ok(!section.includes("rawTexts"))
console.log('Passport .24 exact-candidate decision source guards passed')
