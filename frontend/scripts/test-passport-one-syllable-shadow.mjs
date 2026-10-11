import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
const dir = mkdtempSync(resolve('node_modules', '.passport-shadow-'))
let evaluate
try {
  const src = readFileSync('src/services/passportOneSyllableShadow.ts','utf8')
  const js = ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
  const path=resolve(dir,'policy.mjs')
  writeFileSync(path,js)
  ;({evaluatePassportOneSyllableShadow:evaluate}=await import(pathToFileURL(path).href))
} finally {rmSync(dir,{recursive:true,force:true})}
const c={text:'甲乙丙',score:.94,rank:2,subtype:'one-syllable-mismatch',exactStandalone:true,anchored:true}
assert.deepEqual(evaluate([c],false),{decision:'eligible',text:'甲乙丙'})
assert.equal(evaluate([c],true).decision,'existing-accepted')
assert.equal(evaluate([],false).decision,'no-candidate')
assert.equal(evaluate([c,{...c,text:'丁戊己'}],false).decision,'ambiguous')
assert.equal(evaluate([{...c,subtype:'token-count-mismatch'}],false).decision,'wrong-subtype')
assert.equal(evaluate([{...c,exactStandalone:false}],false).decision,'not-standalone')
assert.equal(evaluate([{...c,anchored:false}],false).decision,'unanchored')
assert.equal(evaluate([{...c,score:.62}],false).decision,'weak-evidence')
assert.equal(evaluate([{...c,rank:1}],false).decision,'weak-evidence')
const ocr=readFileSync('src/services/paddleOcr.ts','utf8')
assert.match(ocr,/OCR_PIPELINE_VERSION\s*=\s*'2026\.10\.11\.28'/)
console.log('Passport .25 conservative shadow gate tests passed')
