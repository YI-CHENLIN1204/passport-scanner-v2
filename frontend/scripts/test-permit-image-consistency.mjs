import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Structural regression: the selected OCR candidate must be the sole source
// of the image and rotation supplied to review. No private images needed.
const source = readFileSync('src/services/paddleOcr.ts', 'utf8')
const start = source.indexOf('export async function recognizeTaiwanCompatriotPermitWithPaddle(')
const end = source.indexOf('export type TaiwanNationalIdSex', start)
assert.ok(start >= 0 && end > start, 'permit production pipeline missing')
const permit = source.slice(start, end)
assert.match(permit, /const deskewImage = await rotateImageFile\(/)
assert.match(permit, /const deskewRotation =/)
assert.match(permit, /if \(\s*permitResultQuality\(deskewPrediction\.result\) >=\s*permitResultQuality\(best\.result\)/)
assert.match(permit, /best = \{\s*rotation: deskewRotation,\s*image: deskewImage,/)
assert.match(permit, /const reviewImage = best\.image\s*const reviewRotation = best\.rotation/)
assert.ok(permit.indexOf('const reviewImage = best.image') > permit.indexOf('best = {\n          rotation: deskewRotation'), 'review source must resolve after quality selection')
assert.doesNotMatch(permit, /reviewImage = await rotateImageFile|reviewRotation =\s*normalizeRotation/, 'rejected rotation may not overwrite selected state')
assert.match(permit, /best\.result\.rotationDegrees =\s*reviewRotation/)
assert.match(permit, /createStraightenedReviewImage\(\s*instance,\s*reviewImage,/)
console.log('Permit selected-image/rotation consistency source guard passed')
