import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const dir = mkdtempSync(resolve('node_modules', '.passport-shadow-merge-'))
let merge
try {
  const js = ts.transpileModule(
    readFileSync('src/services/passportShadowMerge.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
  ).outputText
  const file = resolve(dir, 'merge.mjs')
  writeFileSync(file, js)
  ;({ mergePassportStrictShadow: merge } = await import(pathToFileURL(file).href))
} finally { rmSync(dir, { recursive: true, force: true }) }

assert.deepEqual(merge('已選姓名', ['其他候選']), { value: null, reason: 'accepted' })
assert.deepEqual(merge('', ['甲乙丙', '甲乙丙']), { value: '甲乙丙', reason: 'unique' })
assert.deepEqual(merge('', ['甲乙丙', '丁戊己']), { value: null, reason: 'ambiguous' })
assert.deepEqual(merge('', []), { value: null, reason: 'none' })
assert.deepEqual(merge('', [null, undefined, '甲乙丙']), { value: '甲乙丙', reason: 'unique' })

const page = readFileSync('src/views/OcrQualityPage.vue', 'utf8')
assert.match(page, /mergePassportStrictShadow\(/)
assert.match(page, /const strictCandidate = strictMerge\.value/)
const ocr = readFileSync('src/services/paddleOcr.ts', 'utf8')
assert.match(ocr, /OCR_PIPELINE_VERSION\s*=\s*'2026\.10\.11\.28'/)
console.log('Passport .26 shadow final-selection merge tests passed')
