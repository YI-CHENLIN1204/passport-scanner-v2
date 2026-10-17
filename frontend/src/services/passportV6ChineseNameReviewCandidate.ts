import { PaddleOCR } from '@paddleocr/paddleocr-js'
import {
  createPassportBroadVizProbeImage,
  createPassportLowerPageNameProbeImage,
  extractPassportChineseNameCandidatesForProbe,
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
    const candidates = extractPassportChineseNameCandidatesForProbe(prediction)
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

  const roi = await createPassportBroadVizProbeImage(image)
  let evidence = evaluatePrediction(await recognizer.predict(roi))
  if (evidence.compatibleCandidates.length === 0) {
    // Run only for tall, stacked passport images when the broad VIZ misses.
    // It is still a review-only proposal; no candidate is auto-applied.
    const lowerPage = await createPassportLowerPageNameProbeImage(image)
    if (lowerPage) {
      const retry = evaluatePrediction(await recognizer.predict(lowerPage))
      if (retry.compatibleCandidates.length === 1) {
        evidence = retry
      }
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
