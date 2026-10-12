import { createWorker, PSM } from 'tesseract.js'
import { createPassportBroadVizProbeImage } from './paddleOcr'

/** Independent chi_tra OCR path. Experimental, not part of production OCR.
 * Language data is loaded by Tesseract.js; no image/recognition output is sent
 * to our backend or retained after this single evaluation session.
 */
export async function createAlternativeChineseRecognition() {
  const started = performance.now()
  const worker = await createWorker('chi_tra', 1)
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT })
  return {
    initMs: Math.round(performance.now() - started),
    async recognize(file: File) {
      const roi = await createPassportBroadVizProbeImage(file)
      const url = URL.createObjectURL(roi)
      try {
        const startedAt = performance.now()
        const result = await worker.recognize(url)
        return {
          text: result.data.text,
          wallMs: Math.round(performance.now() - startedAt),
        }
      } finally {
        URL.revokeObjectURL(url)
      }
    },
    async dispose() {
      await worker.terminate()
    },
  }
}

/** Strict full-name test: avoid treating a substring inside a longer row as
 * proof that an eligible, standalone OCR candidate was produced.
 */
export function containsStandaloneChineseName(
  recognized: string,
  expected: string,
) {
  const target = expected.replace(/\s+/g, '').trim()
  if (!/^[\p{Script=Han}]{2,6}$/u.test(target)) return false
  return recognized
    .split(/[\r\n]+/)
    .map(line => line.replace(/\s+/g, '').replace(/[：:，,。．.]/g, ''))
    .some(line => line === target || line === `姓名${target}`)
}
