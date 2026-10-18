import { PaddleOCR } from '@paddleocr/paddleocr-js'
import {
  createPassportBroadVizProbeImage,
  createPassportLowerPageNameProbeImage,
  extractPassportV6ReviewCandidates,
} from './paddleOcr'
import { compareChineseNameToMrzRomanization } from './nameRomanization'
import { convertSimplifiedNameToTraditional } from './nameScriptConversion'

const modelRoot =
  import.meta.env.VITE_PADDLE_MODEL_BASE_URL?.replace(/\/$/, '') ??
  '/paddle-models'
const modelVersion = 'ppocrv6-small-review-20261017-1'
const detectionModelUrl =
  `${modelRoot}/experiments/PP-OCRv6_small_det_onnx_infer.tar?v=${modelVersion}`
const recognitionModelUrl =
  `${modelRoot}/experiments/PP-OCRv6_small_rec_onnx_infer.tar?v=${modelVersion}`

export interface PassportV6ReviewResult {
  status: 'suggested' | 'no-compatible-candidate' | 'ambiguous-compatible-candidates'
  candidate: string | null
  candidateCount: number
  compatibleCandidateCount: number
  ambiguousScriptCount: number
  scriptConvertedCount: number
  model: 'PP-OCRv6_small_rec'
  candidateSource: 'broad-viz' | 'lower-page' | 'contrast-review'
}

let recognizerPromise: ReturnType<typeof PaddleOCR.create> | null = null

function createRecognizer() {
  return PaddleOCR.create({
    lang: 'ch',
    ocrVersion: 'PP-OCRv6',
    textDetectionModelName: 'PP-OCRv6_small_det',
    textDetectionModelAsset: { url: detectionModelUrl },
    textRecognitionModelName: 'PP-OCRv6_small_rec',
    textRecognitionModelAsset: { url: recognitionModelUrl },
    worker: true,
    ortOptions: {
      backend: 'wasm',
      numThreads: 1,
      wasmPaths: '/ort-wasm/',
    },
  })
}
async function getRecognizer() {
  if (!recognizerPromise) {
    recognizerPromise = createRecognizer().catch(error => {
      recognizerPromise = null
      throw error
    })
  }
  return recognizerPromise
}

/** Review-only. Never writes to passport official Chinese name. */
export async function suggestPassportV6NameForReview(
  image: File,
  surname: string,
  givenNames: string,
): Promise<PassportV6ReviewResult> {
  const recognizer = await getRecognizer()

  const evaluatePrediction = (prediction: unknown) => {
    const candidates = extractPassportV6ReviewCandidates(prediction)
    const conversions = candidates.map(candidate =>
      convertSimplifiedNameToTraditional(candidate.replaceAll('温', '溫')),
    )
    const ambiguousScriptCount = conversions.filter(
      entry => entry.ambiguousCharacters.length > 0,
    ).length
    const scriptConvertedCount = conversions.filter(
      (entry, index) => entry.value !== candidates[index],
    ).length
    const compatibleCandidates = [...new Set(
      conversions
        .filter(entry => entry.ambiguousCharacters.length === 0)
        .map(entry => entry.value)
        .filter(candidate =>
          compareChineseNameToMrzRomanization(
            candidate, surname, givenNames,
          ) === 'compatible',
        ),
    )]
    return {
      candidates,
      ambiguousScriptCount,
      scriptConvertedCount,
      compatibleCandidates,
    }
  }

/**
 * D-128: restrained luminance normalization for optional review-only OCR.
 * Preserve chroma and geometry. No OCR text, image, or identity is logged.
 */
async function normalizePassportNameRoiLuminance(input: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(input)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('Passport enhancement canvas unavailable')
    ctx.drawImage(bitmap, 0, 0)
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const px = img.data
    const histogram = new Uint32Array(256)
    for (let i = 0; i < px.length; i += 4) {
      const lum = Math.round(px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114)
      histogram[lum]++
    }
    const total = canvas.width * canvas.height
    const percentile = (fraction: number) => {
      const goal = total * fraction
      let acc = 0
      for (let i = 0; i < histogram.length; i++) {
        acc += histogram[i]
        if (acc >= goal) return i
      }
      return 255
    }
    const low = percentile(0.05)
    const high = percentile(0.95)
    // Avoid amplifying nearly flat or already well-exposed photographs.
    if (high - low < 48 || (low <= 12 && high >= 242)) return input
    const gain = Math.min(1.4, 210 / (high - low))
    const pivot = (low + high) / 2
    for (let i = 0; i < px.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const normalized = (px[i + c] - pivot) * gain + 127.5
        px[i + c] = Math.max(0, Math.min(255, Math.round(normalized)))
      }
    }
    ctx.putImageData(img, 0, 0)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Cannot encode normalized crop')), 'image/png')
    })
  } finally {
    bitmap.close()
  }
}

  const roi = await createPassportBroadVizProbeImage(image)
  let evidence = evaluatePrediction(await recognizer.predict(roi))
  let candidateSource: PassportV6ReviewResult['candidateSource'] = 'broad-viz'
  let retryImage: Blob = roi
  if (evidence.compatibleCandidates.length === 0) {
    // A second crop is optional. Its failure must not erase successful
    // first-pass OCR evidence or turn the overall review result unavailable.
    try {
      const lowerPage = await createPassportLowerPageNameProbeImage(image)
      if (lowerPage) {
        const retry = evaluatePrediction(await recognizer.predict(lowerPage))
        if (retry.compatibleCandidates.length > 0) {
          // Keep BOTH unique suggestions and ambiguous findings.
          // An ambiguous retry must abstain, never silently become
          // "no compatible candidate" or auto-fill a person's name.
          evidence = retry
          candidateSource = 'lower-page'
        } else {
          retryImage = lowerPage
        }
      }
    } catch {
      // Keep first-pass evidence, including its anonymized counts.
    }
  }
  if (evidence.compatibleCandidates.length === 0) {
    // A single optional alternate input. Its outcome can only be suggested
    // for human review, never applied to official name fields.
    try {
      const normalized = await normalizePassportNameRoiLuminance(retryImage)
      if (normalized !== retryImage) {
        const normalizedResult = evaluatePrediction(await recognizer.predict(normalized))
        if (normalizedResult.compatibleCandidates.length > 0) {
          evidence = normalizedResult
          candidateSource = 'contrast-review'
        }
      }
    } catch {
      // A failed enhancement must not discard either existing OCR result.
    }
  }
  const {
    candidates,
    ambiguousScriptCount,
    scriptConvertedCount,
    compatibleCandidates,
  } = evidence
  return {
    status: compatibleCandidates.length === 1
      ? 'suggested'
      : compatibleCandidates.length > 1
        ? 'ambiguous-compatible-candidates'
        : 'no-compatible-candidate',
    candidate: compatibleCandidates.length === 1
      ? compatibleCandidates[0] : null,
    candidateCount: candidates.length,
    compatibleCandidateCount: compatibleCandidates.length,
    ambiguousScriptCount,
    scriptConvertedCount,
    model: 'PP-OCRv6_small_rec',
    candidateSource,
  }
}

export async function disposePassportV6ReviewRecognizer() {
  const pending = recognizerPromise
  recognizerPromise = null
  if (!pending) return
  try {
    const recognizer = await pending
    await recognizer.dispose()
  } catch {
    // Optional model errors must never block the PP-OCRv5 production path.
  }
}
