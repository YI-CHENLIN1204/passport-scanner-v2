import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync('src/views/OcrQualityPage.vue', 'utf8')
assert.match(page, /source: 'name-field' \| 'viz-crop'/)
assert.match(page, /source: item\.source/)
assert.match(page, /function diagnosePassportCrops\(/)
assert.match(page, /function aggregatePassportCropDiagnostics\(/)
assert.match(page, /passportNameFailure !== null/)
assert.match(page, /passportCropDiagnosisCounts/)
assert.match(page, /nameFieldExact/)
assert.match(page, /vizExact/)
assert.match(page, /bothWrong/)
assert.match(page, /vizRescuedExact/)
assert.match(page, /passportCropDiagnosis,\s*passportExactDecision/)
assert.doesNotMatch(page.slice(page.indexOf('interface PassportCropDiagnosisCounts'), page.indexOf('// Anonymous per-region classification')), /rawTexts|candidateTexts|expectedName|sampleId/)
console.log('Passport .22 anonymous crop-source diagnostics wiring guards passed')
