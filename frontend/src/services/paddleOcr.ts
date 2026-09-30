import { PaddleOCR } from '@paddleocr/paddleocr-js'
import {
  normalizeMrzCandidate,
  normalizeTd3Line1,
  repairTd3Line2,
  validateTd3Line2,
  type MrzRepairInfo,
  type MrzValidation,
} from './ocr'

type PaddleInstance = Awaited<ReturnType<typeof PaddleOCR.create>>

interface PaddleItemLike {
  text?: string
  score?: number
  poly?: unknown
}

interface PaddleItemGeometry {
  text: string
  score: number | null
  minX: number
  centerY: number
  height: number
}

export interface PaddleBaselineResult {
  initializationMs: number
  predictMs: number
  totalMs: number
  detectedItems: number
  detectedBoxes: number | null
  recognizedCount: number | null
  averageScore: number | null
  mrzLine1: string | null
  mrzLine2: string | null
  line2Validation: MrzValidation | null
  mrzRepair: MrzRepairInfo | null
  structureComplete: boolean
  fallbackUsed: boolean
  fallbackCropRatio: number | null
  runtime: string
}

export interface PaddleBatchProgress {
  completed: number
  total: number
  current: number
  stage: 'initializing' | 'predicting' | 'fallback' | 'completed'
  message: string
}

let paddleInstance: PaddleInstance | null = null
let paddlePromise: Promise<PaddleInstance> | null = null

function pointsFromPoly(poly: unknown): Array<[number, number]> {
  if (!Array.isArray(poly)) return []

  return poly.flatMap((point): Array<[number, number]> => {
    if (
      Array.isArray(point) &&
      point.length >= 2 &&
      typeof point[0] === 'number' &&
      typeof point[1] === 'number'
    ) {
      return [[point[0], point[1]]]
    }

    return []
  })
}

function toGeometry(item: PaddleItemLike): PaddleItemGeometry | null {
  const text = typeof item.text === 'string' ? item.text.trim() : ''
  if (!text) return null

  const points = pointsFromPoly(item.poly)

  if (!points.length) {
    return {
      text,
      score: typeof item.score === 'number' ? item.score : null,
      minX: 0,
      centerY: 0,
      height: 0,
    }
  }

  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  return {
    text,
    score: typeof item.score === 'number' ? item.score : null,
    minX: Math.min(...xs),
    centerY: (minY + maxY) / 2,
    height: Math.max(1, maxY - minY),
  }
}

function buildTextRows(items: PaddleItemLike[]) {
  const geometries = items
    .map(toGeometry)
    .filter((item): item is PaddleItemGeometry => item !== null)

  const withGeometry = geometries.filter((item) => item.height > 0)

  if (!withGeometry.length) {
    return geometries.map((item) => item.text)
  }

  const sorted = [...withGeometry].sort(
    (a, b) => a.centerY - b.centerY || a.minX - b.minX,
  )

  const rows: PaddleItemGeometry[][] = []

  for (const item of sorted) {
    const current = rows.at(-1)

    if (!current) {
      rows.push([item])
      continue
    }

    const currentCenter =
      current.reduce((sum, value) => sum + value.centerY, 0) /
      current.length
    const currentHeight =
      current.reduce((sum, value) => sum + value.height, 0) /
      current.length

    const tolerance = Math.max(currentHeight, item.height) * 0.8

    if (Math.abs(item.centerY - currentCenter) <= tolerance) {
      current.push(item)
    } else {
      rows.push([item])
    }
  }

  return rows.map((row) =>
    [...row]
      .sort((a, b) => a.minX - b.minX)
      .map((item) => item.text)
      .join(''),
  )
}

function scoreValidation(validation: MrzValidation | null) {
  if (!validation) return 0

  return [
    validation.documentNumber,
    validation.birthDate,
    validation.expiryDate,
    validation.composite,
  ].filter((value) => value === true).length
}

function chooseMrz(items: PaddleItemLike[]) {
  const texts = [
    ...items
      .map((item) => (typeof item.text === 'string' ? item.text : ''))
      .filter(Boolean),
    ...buildTextRows(items),
  ]

  const candidates = Array.from(
    new Set(
      texts
        .map(normalizeMrzCandidate)
        .filter((line) => line.length >= 20 && line.length <= 64),
    ),
  )

  const line1 =
    candidates
      .filter((line) => line.startsWith('P'))
      .map((line) => normalizeTd3Line1(line))
      .sort(
        (a, b) =>
          Math.abs(a.length - 44) - Math.abs(b.length - 44),
      )[0] ?? null

  const line2Candidates = candidates
    .filter((line) => !line.startsWith('P'))
    .map((line) => {
      const repaired = repairTd3Line2(line)
      const validation = validateTd3Line2(repaired.line)

      return {
        line: repaired.line,
        repair: repaired.repair,
        validation,
        score:
          (validation?.requiredValid ? 1000 : 0) +
          scoreValidation(validation) * 100 -
          Math.abs(line.length - 44) * 5 +
          ((line.match(/\d/g)?.length ?? 0) >= 10 ? 10 : 0),
      }
    })
    .sort((a, b) => b.score - a.score)

  const line2 = line2Candidates[0] ?? null

  return {
    line1,
    line2: line2?.line ?? null,
    validation: line2?.validation ?? null,
    repair: line2?.repair ?? null,
  }
}

const paddleModelBaseUrl =
  import.meta.env.VITE_PADDLE_MODEL_BASE_URL?.replace(/\/$/, '') ??
  '/paddle-models'

const detectionModelUrl =
  `${paddleModelBaseUrl}/paddlex/official_inference_model/paddle3.0.0/PP-OCRv5_mobile_det_onnx_infer.tar`

const recognitionModelUrl =
  `${paddleModelBaseUrl}/paddlex/official_inference_model/paddle3.0.0/PP-OCRv5_mobile_rec_onnx_infer.tar`

function createPaddlePromise() {
  paddlePromise = PaddleOCR.create({
    lang: 'en',
    ocrVersion: 'PP-OCRv5',
    textDetectionModelName: 'PP-OCRv5_mobile_det',
    textDetectionModelAsset: {
      url: detectionModelUrl,
    },
    textRecognitionModelName: 'PP-OCRv5_mobile_rec',
    textRecognitionModelAsset: {
      url: recognitionModelUrl,
    },
    ortOptions: {
      backend: 'auto',
    },
  })
    .then((instance) => {
      paddleInstance = instance
      return instance
    })
    .catch((error) => {
      // A rejected shared promise would otherwise poison every later OCR
      // attempt until the page is reloaded. Clear it so the next call can
      // retry model/resource initialization.
      paddlePromise = null
      paddleInstance = null
      throw error
    })

  return paddlePromise
}

function isFetchFailure(error: unknown) {
  return (
    error instanceof Error &&
    /failed to fetch|networkerror|load failed/i.test(error.message)
  )
}

async function getPaddle() {
  if (paddleInstance) {
    return {
      instance: paddleInstance,
      initializationMs: 0,
    }
  }

  const startedAt = performance.now()
  let lastError: unknown = null

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const instance = await (paddlePromise ?? createPaddlePromise())

      return {
        instance,
        initializationMs: performance.now() - startedAt,
      }
    } catch (error) {
      lastError = error

      if (attempt === 0 && isFetchFailure(error)) {
        await new Promise((resolve) => setTimeout(resolve, 700))
        continue
      }

      break
    }
  }

  if (isFetchFailure(lastError)) {
    throw new Error(
      'PaddleOCR 模型／執行資源下載失敗。請確認網路後再按一次；系統已清除失敗的初始化狀態，可直接重試。',
    )
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('PaddleOCR 初始化失敗。')
}

function buildBaselineResult(
  prediction: unknown,
  initializationMs: number,
  predictMs: number,
  totalMs: number,
  fallbackUsed = false,
  fallbackCropRatio: number | null = null,
): PaddleBaselineResult {
  const typedPrediction = prediction as
    | {
        items?: unknown
        runtime?: unknown
        metrics?: unknown
      }
    | undefined

  const items = (typedPrediction?.items ?? []) as PaddleItemLike[]
  const mrz = chooseMrz(items)

  const numericScores = items
    .map((item) => item.score)
    .filter((score): score is number => typeof score === 'number')

  const averageScore = numericScores.length
    ? numericScores.reduce((sum, score) => sum + score, 0) /
      numericScores.length
    : null

  const runtimeData = typedPrediction?.runtime as
    | Record<string, unknown>
    | undefined

  const metricsData = typedPrediction?.metrics as
    | Record<string, unknown>
    | undefined

  const detectedBoxes =
    typeof metricsData?.detectedBoxes === 'number'
      ? metricsData.detectedBoxes
      : null

  const recognizedCount =
    typeof metricsData?.recognizedCount === 'number'
      ? metricsData.recognizedCount
      : null

  const runtime =
    runtimeData && Object.keys(runtimeData).length
      ? JSON.stringify(runtimeData)
      : 'browser'

  return {
    initializationMs,
    predictMs,
    totalMs,
    detectedItems: items.length,
    detectedBoxes,
    recognizedCount,
    averageScore,
    mrzLine1: mrz.line1,
    mrzLine2: mrz.line2,
    line2Validation: mrz.validation,
    mrzRepair: mrz.repair,
    structureComplete:
      mrz.line1?.length === 44 &&
      mrz.line2?.length === 44,
    fallbackUsed,
    fallbackCropRatio,
    runtime,
  }
}

async function createBottomCrop(
  image: File,
  cropRatio = 0.45,
) {
  const bitmap = await createImageBitmap(image)
  const sourceY = Math.floor(bitmap.height * (1 - cropRatio))
  const sourceHeight = bitmap.height - sourceY

  const targetWidth = Math.min(1800, bitmap.width)
  const scale = targetWidth / bitmap.width
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight

  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('無法建立 PaddleOCR MRZ fallback Canvas。')
  }

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, targetWidth, targetHeight)
  context.drawImage(
    bitmap,
    0,
    sourceY,
    bitmap.width,
    sourceHeight,
    0,
    0,
    targetWidth,
    targetHeight,
  )

  bitmap.close()

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('無法建立 PaddleOCR MRZ fallback 圖片。'))
      }
    }, 'image/png')
  })
}

function resultQuality(result: PaddleBaselineResult) {
  return (
    (result.line2Validation?.requiredValid ? 10000 : 0) +
    (result.structureComplete ? 5000 : 0) +
    (result.line2Validation
      ? [
          result.line2Validation.documentNumber,
          result.line2Validation.birthDate,
          result.line2Validation.expiryDate,
          result.line2Validation.composite,
        ].filter((value) => value === true).length * 500
      : 0) +
    (result.detectedBoxes ?? 0) * 2 +
    (result.recognizedCount ?? 0)
  )
}

async function predictOne(
  instance: PaddleInstance,
  image: File,
  initializationMs = 0,
  onFallback?: () => void,
): Promise<PaddleBaselineResult> {
  const totalStartedAt = performance.now()

  const fullStartedAt = performance.now()
  const [prediction] = await instance.predict(image)
  const fullPredictMs = performance.now() - fullStartedAt

  let best = buildBaselineResult(
    prediction,
    initializationMs,
    fullPredictMs,
    performance.now() - totalStartedAt,
  )

  // Detection=0 means recognition never got a chance. Retry only those
  // failures on a tighter bottom crop where passport MRZ normally sits.
  if ((best.detectedBoxes ?? 0) === 0) {
    onFallback?.()

    const cropRatio = 0.45
    const crop = await createBottomCrop(image, cropRatio)

    const fallbackStartedAt = performance.now()
    const [fallbackPrediction] = await instance.predict(crop)
    const fallbackPredictMs = performance.now() - fallbackStartedAt

    const fallback = buildBaselineResult(
      fallbackPrediction,
      initializationMs,
      fullPredictMs + fallbackPredictMs,
      performance.now() - totalStartedAt,
      true,
      cropRatio,
    )

    if (resultQuality(fallback) > resultQuality(best)) {
      best = fallback
    }
  }

  return best
}

export async function recognizePassportWithPaddle(
  image: File,
): Promise<PaddleBaselineResult> {
  const { instance, initializationMs } = await getPaddle()
  return predictOne(instance, image, initializationMs)
}

export async function recognizePassportsWithPaddle(
  images: File[],
  onProgress?: (progress: PaddleBatchProgress) => void,
): Promise<PaddleBaselineResult[]> {
  if (!images.length) return []

  onProgress?.({
    completed: 0,
    total: images.length,
    current: 0,
    stage: 'initializing',
    message: '正在準備 PaddleOCR 模型…',
  })

  const { instance, initializationMs } = await getPaddle()
  const results: PaddleBaselineResult[] = []

  for (let index = 0; index < images.length; index += 1) {
    const current = index + 1

    onProgress?.({
      completed: index,
      total: images.length,
      current,
      stage: 'predicting',
      message: `正在辨識第 ${current} / ${images.length} 張護照…`,
    })

    // Yield before the heavy inference so Vue/CSS gets a chance to paint
    // the latest progress state instead of looking frozen.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    )

    const result = await predictOne(
      instance,
      images[index],
      index === 0 ? initializationMs : 0,
      () => {
        onProgress?.({
          completed: index,
          total: images.length,
          current,
          stage: 'fallback',
          message: `第 ${current} 張全頁未偵測到文字，改試底部 MRZ 裁切…`,
        })
      },
    )

    results.push(result)

    onProgress?.({
      completed: current,
      total: images.length,
      current,
      stage: 'completed',
      message: `已完成第 ${current} / ${images.length} 張。`,
    })

    // Let the browser render the completed state before starting the next one.
    await new Promise<void>((resolve) =>
      setTimeout(resolve, 50),
    )
  }

  return results
}
