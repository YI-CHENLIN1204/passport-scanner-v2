import { PaddleOCR } from '@paddleocr/paddleocr-js'
import {
  createPassportBroadVizProbeImage,
  extractPassportChineseNameCandidatesForProbe,
} from './paddleOcr'
import {
  compareChineseNameToMrzRomanization,
} from './nameRomanization'
import { convertSimplifiedNameToTraditional } from './nameScriptConversion'

const paddleModelBaseUrl =
  import.meta.env.VITE_PADDLE_MODEL_BASE_URL?.replace(/\/$/, '') ??
  '/paddle-models'

const detectionModelUrl =
  `${paddleModelBaseUrl}/paddlex/official_inference_model/paddle3.0.0/PP-OCRv5_mobile_det_onnx_infer.tar?v=ppocrv5-onnx-20261003-canonical-3`

const recognitionModelName =
  'chinese_cht_PP-OCRv3_mobile_rec'
const recognitionModelUrl =
  `${paddleModelBaseUrl}/experiments/chinese_cht_PP-OCRv3_mobile_rec_rapidocr.tar?v=rapidocr-cht-v3-20261016-1`

export type PassportChineseNameReviewCandidateStatus =
  | 'suggested'
  | 'no-compatible-candidate'
  | 'ambiguous-compatible-candidates'

export interface PassportChineseNameReviewCandidateResult {
  status: PassportChineseNameReviewCandidateStatus
  candidate: string | null
  candidateCount: number
  compatibleCandidateCount: number
  model: 'chinese_cht_PP-OCRv3_rec_mobile.onnx'
}

let recognizerPromise:
  ReturnType<typeof PaddleOCR.create> | null = null

function createRecognizer() {
  return PaddleOCR.create({
    lang: 'chinese_cht',
    ocrVersion: 'PP-OCRv5',
    textDetectionModelName: 'PP-OCRv5_mobile_det',
    textDetectionModelAsset: {
      url: detectionModelUrl,
    },
    textRecognitionModelName: recognitionModelName,
    textRecognitionModelAsset: {
      url: recognitionModelUrl,
    },
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

export async function suggestPassportChineseNameForReview(
  image: File,
  surname: string,
  givenNames: string,
): Promise<PassportChineseNameReviewCandidateResult> {
  const roi = await createPassportBroadVizProbeImage(image)
  const recognizer = await getRecognizer()
  const prediction = await recognizer.predict(roi)

  const candidates =
    extractPassportChineseNameCandidatesForProbe(prediction)
  const compatibleCandidates = Array.from(
    new Set(
      candidates
        .map(candidate =>
          convertSimplifiedNameToTraditional(
            candidate.replaceAll('温', '溫'),
          ),
        )
        .filter(conversion => conversion.ambiguousCharacters.length === 0)
        .map(conversion => conversion.value)
        .filter(candidate =>
          compareChineseNameToMrzRomanization(
            candidate,
            surname,
            givenNames,
          ) === 'compatible',
        ),
    ),
  )

  if (compatibleCandidates.length === 1) {
    return {
      status: 'suggested',
      candidate: compatibleCandidates[0],
      candidateCount: candidates.length,
      compatibleCandidateCount: 1,
      model: 'chinese_cht_PP-OCRv3_rec_mobile.onnx',
    }
  }

  return {
    status:
      compatibleCandidates.length > 1
        ? 'ambiguous-compatible-candidates'
        : 'no-compatible-candidate',
    candidate: null,
    candidateCount: candidates.length,
    compatibleCandidateCount:
      compatibleCandidates.length,
    model: 'chinese_cht_PP-OCRv3_rec_mobile.onnx',
  }
}

export async function disposePassportChineseNameReviewRecognizer() {
  const pending = recognizerPromise
  recognizerPromise = null

  if (!pending) return

  try {
    const recognizer = await pending
    await recognizer.dispose()
  } catch {
    // Review-only candidate runtime failure must never affect production OCR.
  }
}
