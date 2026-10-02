import { PaddleOCR } from '@paddleocr/paddleocr-js'
import {
  isPlausibleTd3Line1,
  normalizeMrzCandidate,
  normalizeTd3Line1,
  parseTd3Mrz,
  repairTd3Line2,
  validateTd3Line2,
  type MrzRepairInfo,
  type MrzValidation,
  type ParsedMrz,
} from './ocr'
import {
  compareChineseNameToMrzRomanization,
  type RomanizationCompatibility,
} from './nameRomanization'
import {
  parseTaiwanPermitMrz,
  type ParsedTaiwanPermitMrz,
} from './taiwanPermitMrz'

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
  maxX: number
  centerX: number
  minY: number
  maxY: number
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
  line1Valid: boolean
  line2Validation: MrzValidation | null
  mrzRepair: MrzRepairInfo | null
  parsedMrz: ParsedMrz | null
  chineseName: string | null
  chineseNameScore: number | null
  chineseNameSource: 'name-field' | 'viz-crop' | null
  chineseNameRomanizationStatus: RomanizationCompatibility
  structureComplete: boolean
  fallbackUsed: boolean
  fallbackCropRatio: number | null
  runtime: string
  rotationDegrees?: number
  orientationAttempts?: number
  detectedSkewDegrees?: number
  textHorizontalScore?: number
  orientedImage?: File
}

export interface PassportOcrProgress {
  stage:
    | 'initializing'
    | 'orientation'
    | 'fallback'
    | 'deskew'
    | 'completed'
  progress: number
  message: string
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
      maxX: 0,
      centerX: 0,
      minY: 0,
      maxY: 0,
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
    maxX: Math.max(...xs),
    centerX: (Math.min(...xs) + Math.max(...xs)) / 2,
    minY,
    maxY,
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


const taiwanVizChineseLabels = new Set([
  '中華民國',
  '護照',
  '姓名',
  '國籍',
  '性別',
  '出生日期',
  '出生地',
  '發照日期',
  '有效日期',
  '有效期限',
  '簽發機關',
  '外交部',
  '持照人簽名',
  '身分證統一編號',
  '個人身分證字號',
  '種類',
  '國家代碼',
  '護照號碼',
])

function normalizeChineseNameCandidate(value: string) {
  return value
    .replace(/\s+/g, '')
    .replace(/[，,。．.：:；;()（）\[\]【】]/g, '')
    .trim()
}

function isPlausibleTaiwanChineseName(value: string) {
  const normalized = normalizeChineseNameCandidate(value)

  if (normalized.length < 2 || normalized.length > 12) return false
  if (taiwanVizChineseLabels.has(normalized)) return false
  if (
    [
      '中華民國',
      '護照',
      '外交',
      '姓名',
      '國籍',
      '出生',
      '發照',
      '有效',
      '簽發',
      '機關',
      '持照人',
      '身分證',
      '國家代碼',
      '種類',
    ].some((label) => normalized.includes(label))
  ) {
    return false
  }
  if (/\d/.test(normalized)) return false

  // Taiwan passport Chinese names are normally Han characters, with a
  // possible middle dot for compound / indigenous naming styles.
  return /^[\p{Script=Han}·‧]+$/u.test(normalized)
}

function normalizeLatinNameForMatch(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
}

function chooseTaiwanChineseName(
  items: PaddleItemLike[],
  parsedMrz: ParsedMrz | null,
) {
  const geometries = items
    .map((item) => {
      const geometry = toGeometry(item)
      if (!geometry) return null

      return {
        ...geometry,
        rawText: geometry.text,
        normalized: normalizeChineseNameCandidate(geometry.text),
      }
    })
    .filter(
      (
        item,
      ): item is PaddleItemGeometry & {
        rawText: string
        normalized: string
      } => item !== null,
    )

  const nameLabels = geometries.filter((item) =>
    item.rawText.includes('姓名'),
  )

  const expectedSurname = normalizeLatinNameForMatch(
    parsedMrz?.surname ?? '',
  )
  const expectedGiven = normalizeLatinNameForMatch(
    parsedMrz?.givenNames ?? '',
  )
  const expectedFull = expectedSurname + expectedGiven

  const englishNameAnchors = geometries.filter((item) => {
    const latin = normalizeLatinNameForMatch(item.rawText)
    if (!latin || expectedSurname.length < 2) return false

    const surnameMatch = latin.includes(expectedSurname)
    const fullMatch =
      expectedFull.length >= 4 &&
      (
        latin.includes(expectedFull) ||
        expectedFull.includes(latin)
      )

    const givenPrefix =
      expectedGiven.length >= 2
        ? expectedGiven.slice(0, Math.min(4, expectedGiven.length))
        : ''

    const partialMatch =
      surnameMatch &&
      (
        !givenPrefix ||
        latin.includes(givenPrefix)
      )

    return fullMatch || partialMatch
  })

  const directLabelValues = geometries.flatMap((item) => {
    if (!item.rawText.includes('姓名')) return []

    const afterLabel = item.rawText.split('姓名').slice(1).join('')
    const hanOnly = afterLabel
      .replace(/[^\p{Script=Han}·‧]/gu, '')
      .trim()

    if (!isPlausibleTaiwanChineseName(hanOnly)) return []

    const romanizationStatus =
      parsedMrz
        ? compareChineseNameToMrzRomanization(
            hanOnly,
            parsedMrz.surname,
            parsedMrz.givenNames,
          )
        : 'unknown'

    return [
      {
        text: hanOnly,
        score: item.score ?? 0,
        romanizationStatus,
        rank:
          (item.score ?? 0) +
          2 +
          (romanizationStatus === 'compatible' ? 1.5 : 0),
      },
    ]
  })

  if (
    !nameLabels.length &&
    !englishNameAnchors.length
  ) {
    const direct = directLabelValues
      .filter(
        (candidate) =>
          candidate.romanizationStatus === 'compatible',
      )
      .sort((a, b) => b.rank - a.rank)[0]

    return direct && direct.score >= 0.65
      ? direct
      : null
  }

  const spatialCandidates = geometries
    .filter((item) =>
      isPlausibleTaiwanChineseName(item.normalized),
    )
    .flatMap((item) => {
      const text = item.normalized
      const score = item.score ?? 0
      const candidates: Array<{
        text: string
        score: number
        romanizationStatus: RomanizationCompatibility
        rank: number
      }> = []

      for (const label of nameLabels) {
        const scale = Math.max(1, item.height, label.height)
        const vertical =
          Math.abs(item.centerY - label.centerY) / scale
        const below =
          (item.centerY - label.centerY) / scale
        const rightGap =
          (item.minX - label.maxX) / scale

        const sameRow =
          vertical <= 1.6 &&
          rightGap >= -1 &&
          rightGap <= 18

        const nextRow =
          below > 0 &&
          below <= 3.8 &&
          Math.abs(item.centerX - label.centerX) <= scale * 18

        if (sameRow || nextRow) {
          const romanizationStatus =
            parsedMrz
              ? compareChineseNameToMrzRomanization(
                  text,
                  parsedMrz.surname,
                  parsedMrz.givenNames,
                )
              : 'unknown'

          candidates.push({
            text,
            score,
            romanizationStatus,
            rank:
              score +
              0.75 -
              Math.min(vertical, Math.max(0, below)) * 0.08 -
              Math.max(0, rightGap) * 0.008 +
              (romanizationStatus === 'compatible' ? 1.5 : 0),
          })
        }
      }

      for (const english of englishNameAnchors) {
        const scale = Math.max(1, item.height, english.height)
        const above =
          (english.centerY - item.centerY) / scale
        const horizontalDistance =
          Math.abs(item.centerX - english.centerX) / scale

        // On Taiwan biodata pages, the Chinese name and romanized name
        // belong to the same Name group. A Han candidate immediately above
        // the MRZ-confirmed romanized name is a much stronger signal than
        // OCR confidence alone.
        if (
          above >= -0.5 &&
          above <= 5 &&
          horizontalDistance <= 14
        ) {
          const romanizationStatus =
            parsedMrz
              ? compareChineseNameToMrzRomanization(
                  text,
                  parsedMrz.surname,
                  parsedMrz.givenNames,
                )
              : 'unknown'

          candidates.push({
            text,
            score,
            romanizationStatus,
            rank:
              score +
              1.25 -
              Math.max(0, above) * 0.08 -
              horizontalDistance * 0.015 +
              (romanizationStatus === 'compatible' ? 1.5 : 0),
          })
        }
      }

      return candidates
    })

  const eligible = [
    ...directLabelValues,
    ...spatialCandidates,
  ].filter(
    (candidate) =>
      candidate.romanizationStatus !== 'conflict',
  )

  const best = eligible
    .sort((a, b) => b.rank - a.rank)[0]

  // Precision is more important than recall here. If MRZ exists, only
  // phonetic-compatible Chinese names are allowed to auto-fill; unknown
  // romanization systems fall back to manual entry rather than guessing.
  if (!best || best.score < 0.65) return null

  if (
    parsedMrz &&
    best.romanizationStatus !== 'compatible'
  ) {
    return null
  }

  return best
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
      .filter((line) => isPlausibleTd3Line1(line))
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
    lang: 'chinese_cht',
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

  const line1Valid = isPlausibleTd3Line1(mrz.line1)

  const parsedMrz = parseTd3Mrz(
    mrz.line1,
    mrz.line2,
    mrz.validation,
  )

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
    line1Valid,
    line2Validation: mrz.validation,
    mrzRepair: mrz.repair,
    parsedMrz,
    chineseName: null,
    chineseNameScore: null,
    chineseNameSource: null,
    chineseNameRomanizationStatus: 'unknown',
    structureComplete:
      line1Valid &&
      mrz.line2?.length === 44,
    fallbackUsed,
    fallbackCropRatio,
    runtime,
    detectedSkewDegrees:
      estimateTextSkewDegrees(prediction),
    textHorizontalScore:
      estimateTextHorizontalScore(prediction),
  }
}

async function createPixelCrop(
  image: File,
  sourceX: number,
  sourceY: number,
  sourceWidth: number,
  sourceHeight: number,
  minimumTargetWidth = 1200,
) {
  const bitmap = await createImageBitmap(image)

  const x = Math.max(0, Math.floor(sourceX))
  const y = Math.max(0, Math.floor(sourceY))
  const width = Math.max(
    1,
    Math.min(bitmap.width - x, Math.floor(sourceWidth)),
  )
  const height = Math.max(
    1,
    Math.min(bitmap.height - y, Math.floor(sourceHeight)),
  )

  const targetWidth = Math.min(
    1800,
    Math.max(minimumTargetWidth, width),
  )
  const scale = targetWidth / width
  const targetHeight = Math.max(
    1,
    Math.round(height * scale),
  )

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight

  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('無法建立護照姓名欄裁切 Canvas。')
  }

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, targetWidth, targetHeight)
  context.drawImage(
    bitmap,
    x,
    y,
    width,
    height,
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
        reject(new Error('無法建立護照姓名欄裁切圖片。'))
      }
    }, 'image/png')
  })
}

async function createTaiwanNameFieldCrop(
  image: File,
  items: PaddleItemLike[],
) {
  const bitmap = await createImageBitmap(image)
  const imageWidth = bitmap.width
  const imageHeight = bitmap.height
  bitmap.close()

  const labels = items
    .map(toGeometry)
    .filter(
      (item): item is PaddleItemGeometry =>
        item !== null &&
        item.height > 0 &&
        item.text.includes('姓名') &&
        item.minX >= 0 &&
        item.minY >= 0 &&
        item.maxX <= imageWidth * 1.1 &&
        item.maxY <= imageHeight * 1.1,
    )
    .filter(
      (item) =>
        item.centerY < imageHeight * 0.7,
    )
    .sort((a, b) => a.centerY - b.centerY)

  const label = labels[0]
  if (!label) return null

  const h = Math.max(8, label.height)
  const x = Math.max(0, label.minX - h * 2)
  const y = Math.max(0, label.minY - h * 1.8)

  const width = Math.min(
    imageWidth - x,
    Math.max(
      imageWidth * 0.62,
      h * 34,
    ),
  )
  const height = Math.min(
    imageHeight - y,
    Math.max(
      imageHeight * 0.22,
      h * 9,
    ),
  )

  return createPixelCrop(
    image,
    x,
    y,
    width,
    height,
    1400,
  )
}

async function createRelativeCrop(
  image: File,
  leftRatio: number,
  topRatio: number,
  widthRatio: number,
  heightRatio: number,
) {
  const bitmap = await createImageBitmap(image)

  const sourceX = Math.max(
    0,
    Math.floor(bitmap.width * leftRatio),
  )
  const sourceY = Math.max(
    0,
    Math.floor(bitmap.height * topRatio),
  )
  const sourceWidth = Math.min(
    bitmap.width - sourceX,
    Math.floor(bitmap.width * widthRatio),
  )
  const sourceHeight = Math.min(
    bitmap.height - sourceY,
    Math.floor(bitmap.height * heightRatio),
  )

  const targetWidth = Math.min(1800, sourceWidth)
  const scale = targetWidth / sourceWidth
  const targetHeight = Math.max(
    1,
    Math.round(sourceHeight * scale),
  )

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight

  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('無法建立護照 VIZ 裁切 Canvas。')
  }

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, targetWidth, targetHeight)
  context.drawImage(
    bitmap,
    sourceX,
    sourceY,
    sourceWidth,
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
        reject(new Error('無法建立護照 VIZ 裁切圖片。'))
      }
    }, 'image/png')
  })
}

async function createTaiwanVizCrop(image: File) {
  // Broadly isolate the VIZ side of the biodata page. The OCR result is
  // still not trusted by text/confidence alone: chooseTaiwanChineseName
  // requires an actual 姓名 label and a nearby value.
  return createRelativeCrop(image, 0.24, 0.12, 0.74, 0.58)
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
  const fullPrediction = prediction as
    | { items?: unknown }
    | undefined
  const fullItems =
    (fullPrediction?.items ?? []) as PaddleItemLike[]

  let best = buildBaselineResult(
    prediction,
    initializationMs,
    fullPredictMs,
    performance.now() - totalStartedAt,
  )

  // Retry on a tighter MRZ crop not only when detection is exactly zero,
  // but also when the full-page result is clearly too weak to form a TD3
  // result. This catches cases such as 4 detected boxes / 2 recognized texts
  // with very low confidence, while avoiding extra work on healthy pages.
  const needsLine1Recovery = !best.line1Valid

  const weakFullPage =
    (
      !best.structureComplete &&
      best.line2Validation?.requiredValid !== true &&
      (
        (best.detectedBoxes ?? 0) < 10 ||
        (best.recognizedCount ?? 0) < 5 ||
        (best.averageScore ?? 0) < 0.5
      )
    ) ||
    needsLine1Recovery

  if (weakFullPage) {
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

  const isTaiwanPassport =
    best.parsedMrz?.nationality === 'TWN' ||
    best.parsedMrz?.issuingState === 'TWN'

  if (isTaiwanPassport) {
    const crops: Array<{
      blob: Blob
      source: 'name-field' | 'viz-crop'
    }> = []

    const anchoredCrop = await createTaiwanNameFieldCrop(
      image,
      fullItems,
    )

    if (anchoredCrop) {
      crops.push({
        blob: anchoredCrop,
        source: 'name-field',
      })
    }

    // Broad VIZ is fallback only. It is still subject to the same strict
    // 姓名 / romanized-name anchoring rules.
    crops.push({
      blob: await createTaiwanVizCrop(image),
      source: 'viz-crop',
    })

    for (const crop of crops) {
      const vizStartedAt = performance.now()
      const [vizPrediction] = await instance.predict(crop.blob)
      const vizPredictMs = performance.now() - vizStartedAt

      const typedViz = vizPrediction as
        | { items?: unknown }
        | undefined
      const vizItems =
        (typedViz?.items ?? []) as PaddleItemLike[]
      const vizName = chooseTaiwanChineseName(
        vizItems,
        best.parsedMrz,
      )

      best.predictMs += vizPredictMs
      best.totalMs = performance.now() - totalStartedAt

      if (vizName) {
        best.chineseName = vizName.text
        best.chineseNameScore = vizName.score
        best.chineseNameSource = crop.source
        best.chineseNameRomanizationStatus =
          vizName.romanizationStatus
        break
      }

      // The dynamic name-field crop is preferred. Only if it fails do we
      // spend another inference on the broader VIZ area.
      if (crop.source === 'viz-crop') break
    }
  }

  return best
}

function passportOrientationQuality(
  result: PaddleBaselineResult,
) {
  return (
    (result.textHorizontalScore ?? 0.5) * 1200 +
    resultQuality(result) +
    (result.chineseName ? 100 : 0)
  )
}

async function recognizePassportOrientedWithInstance(
  instance: PaddleInstance,
  image: File,
  initializationMs: number,
  onProgress?: (
    progress: PassportOcrProgress,
  ) => void,
): Promise<PaddleBaselineResult> {
  const attempts: Array<{
    rotation: number
    image: File
    result: PaddleBaselineResult
  }> = []

  const runRotation = async (
    rotation: number,
    progress: number,
  ) => {
    onProgress?.({
      stage: 'orientation',
      progress,
      message:
        rotation === 0
          ? '正在辨識原始方向…'
          : `正在測試旋轉 ${rotation}° 的護照…`,
    })

    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    )

    const rotated =
      await rotateImageFile(image, rotation)

    const result = await predictOne(
      instance,
      rotated,
      attempts.length === 0
        ? initializationMs
        : 0,
      () => {
        onProgress?.({
          stage: 'fallback',
          progress: Math.min(0.82, progress + 0.06),
          message: '正在加強辨識護照底部 MRZ…',
        })
      },
    )

    result.rotationDegrees = rotation
    result.orientationAttempts = attempts.length + 1
    result.orientedImage = rotated

    attempts.push({
      rotation,
      image: rotated,
      result,
    })

    return result
  }

  onProgress?.({
    stage: 'initializing',
    progress: 0.04,
    message: '正在準備 PaddleOCR…',
  })

  const original = await runRotation(0, 0.14)

  const originalStrong =
    original.structureComplete &&
    original.line1Valid &&
    original.line2Validation?.requiredValid === true

  if (!originalStrong) {
    await runRotation(90, 0.32)
    await runRotation(-90, 0.5)

    let currentBest = [...attempts].sort(
      (a, b) =>
        passportOrientationQuality(b.result) -
        passportOrientationQuality(a.result),
    )[0]

    const currentStrong =
      currentBest.result.structureComplete &&
      currentBest.result.line1Valid &&
      currentBest.result.line2Validation?.requiredValid === true

    if (!currentStrong) {
      await runRotation(180, 0.66)
    }
  }

  let best = [...attempts].sort(
    (a, b) =>
      passportOrientationQuality(b.result) -
      passportOrientationQuality(a.result),
  )[0]

  const skew = best.result.detectedSkewDegrees ?? 0
  const needsDeskew =
    Math.abs(skew) >= 2.5 &&
    Math.abs(skew) <= 20 &&
    (
      best.result.line2Validation?.requiredValid !== true ||
      !best.result.line1Valid ||
      (
        (
          best.result.parsedMrz?.nationality === 'TWN' ||
          best.result.parsedMrz?.issuingState === 'TWN'
        ) &&
        !best.result.chineseName
      )
    )

  if (needsDeskew) {
    onProgress?.({
      stage: 'deskew',
      progress: 0.84,
      message:
        `偵測到約 ${Math.abs(skew).toFixed(1)}° 傾斜，正在校正護照…`,
    })

    const deskewed = await rotateImageFile(
      best.image,
      -skew,
    )

    const deskewedResult = await predictOne(
      instance,
      deskewed,
      0,
    )

    deskewedResult.rotationDegrees =
      normalizeRotation(best.rotation - skew)
    deskewedResult.orientationAttempts =
      attempts.length + 1
    deskewedResult.orientedImage = deskewed

    if (
      passportOrientationQuality(deskewedResult) >=
      passportOrientationQuality(best.result)
    ) {
      best = {
        rotation: deskewedResult.rotationDegrees,
        image: deskewed,
        result: deskewedResult,
      }
    }
  }

  best.result.orientationAttempts =
    Math.max(
      best.result.orientationAttempts ?? 1,
      attempts.length,
    )
  best.result.orientedImage = best.image

  onProgress?.({
    stage: 'completed',
    progress: 1,
    message:
      Math.abs(best.result.rotationDegrees ?? 0) < 1
        ? '護照辨識完成。'
        : `護照辨識完成，已自動校正方向 ${(best.result.rotationDegrees ?? 0).toFixed(1)}°。`,
  })

  return best.result
}

export async function recognizePassportWithPaddle(
  image: File,
  onProgress?: (
    progress: PassportOcrProgress,
  ) => void,
): Promise<PaddleBaselineResult> {
  const { instance, initializationMs } = await getPaddle()

  return recognizePassportOrientedWithInstance(
    instance,
    image,
    initializationMs,
    onProgress,
  )
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

    const result =
      await recognizePassportOrientedWithInstance(
        instance,
        images[index],
        index === 0 ? initializationMs : 0,
        (progress) => {
          onProgress?.({
            completed: index,
            total: images.length,
            current,
            stage:
              progress.stage === 'completed'
                ? 'completed'
                : progress.stage === 'fallback'
                  ? 'fallback'
                  : 'predicting',
            message:
              `第 ${current} / ${images.length} 張：${progress.message}`,
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


export type PermitSex = '' | 'M' | 'F' | 'X'

export interface TaiwanCompatriotPermitOcrResult {
  initializationMs: number
  predictMs: number
  totalMs: number
  detectedItems: number
  averageScore: number | null
  chineseName: string
  permitNumber: string
  birthDate: string
  sex: PermitSex
  expiryDate: string
  extractedFieldCount: number
  fieldScores: {
    chineseName: number | null
    permitNumber: number | null
    birthDate: number | null
    sex: number | null
    expiryDate: number | null
  }
  rawRows: string[]
  rotationDegrees: number
  orientationAttempts: number
  orientedImage: File
  parsedMrz: ParsedTaiwanPermitMrz | null
  mrzUsed: boolean
  chineseNamePasses: number
  chineseNameConsensus: number
  chineseNameConfidence: number | null
  textHorizontalScore: number
}

export interface TaiwanCompatriotPermitOcrProgress {
  stage:
    | 'initializing'
    | 'orientation'
    | 'deskew'
    | 'name-retry'
    | 'completed'
  progress: number
  message: string
}

interface PermitCandidate<T> {
  value: T
  score: number | null
  rank: number
}

const permitFixedChineseLabels = [
  '台湾居民来往大陆通行证',
  '臺灣居民來往大陸通行證',
  '中华人民共和国',
  '中華人民共和國',
  '姓名',
  '性别',
  '性別',
  '出生日期',
  '有效期限',
  '有效期',
  '证件号码',
  '證件號碼',
  '签发次数',
  '簽發次數',
  '签发机关',
  '簽發機關',
]

function normalizePermitChineseName(value: string) {
  return value
    .replace(/\s+/g, '')
    .replace(/[，,。．.：:；;()（）\[\]【】]/g, '')
    .trim()
}

const permitAdministrativeNames = new Set([
  '北京', '北京市',
  '天津', '天津市',
  '上海', '上海市',
  '重慶', '重庆', '重慶市', '重庆市',
  '河北', '河北省',
  '山西', '山西省',
  '遼寧', '辽宁', '遼寧省', '辽宁省',
  '吉林', '吉林省',
  '黑龍江', '黑龙江', '黑龍江省', '黑龙江省',
  '江蘇', '江苏', '江蘇省', '江苏省',
  '浙江', '浙江省',
  '安徽', '安徽省',
  '福建', '福建省',
  '江西', '江西省',
  '山東', '山东', '山東省', '山东省',
  '河南', '河南省',
  '湖北', '湖北省',
  '湖南', '湖南省',
  '廣東', '广东', '廣東省', '广东省',
  '海南', '海南省',
  '四川', '四川省',
  '貴州', '贵州', '貴州省', '贵州省',
  '雲南', '云南', '雲南省', '云南省',
  '陝西', '陕西', '陝西省', '陕西省',
  '甘肅', '甘肃', '甘肅省', '甘肃省',
  '青海', '青海省',
  '內蒙古', '内蒙古',
  '廣西', '广西',
  '西藏',
  '寧夏', '宁夏',
  '新疆',
  '香港',
  '澳門', '澳门',
])

function isPlausiblePermitChineseName(value: string) {
  const normalized = normalizePermitChineseName(value)

  if (normalized.length < 2 || normalized.length > 20) return false
  if (!/^[\p{Script=Han}·‧]+$/u.test(normalized)) return false

  if (permitAdministrativeNames.has(normalized)) {
    return false
  }

  if (
    /(?:省|市|縣|县|區|区|自治區|自治区|自治州)$/.test(
      normalized,
    )
  ) {
    return false
  }

  return !permitFixedChineseLabels.some(
    (label) =>
      normalized === label ||
      normalized.includes(label) ||
      label.includes(normalized),
  )
}

function permitLabelMatches(
  text: string,
  labels: string[],
) {
  const compact = text
    .replace(/\s+/g, '')
    .toLowerCase()

  return labels.some((label) =>
    compact.includes(
      label.replace(/\s+/g, '').toLowerCase(),
    ),
  )
}

function geometryDistanceRank(
  label: PaddleItemGeometry,
  candidate: PaddleItemGeometry,
) {
  const scale = Math.max(1, label.height, candidate.height)
  const vertical =
    Math.abs(candidate.centerY - label.centerY) / scale
  const below =
    (candidate.centerY - label.centerY) / scale
  const rightGap =
    (candidate.minX - label.maxX) / scale

  const sameRow =
    vertical <= 1.8 &&
    rightGap >= -1.5 &&
    rightGap <= 24

  const nextRows =
    below > 0 &&
    below <= 4.8 &&
    Math.abs(candidate.centerX - label.centerX) <=
      scale * 22

  if (!sameRow && !nextRows) return null

  return (
    1 -
    vertical * 0.08 -
    Math.max(0, rightGap) * 0.006 -
    Math.max(0, below - 1) * 0.04
  )
}

function findLabelAnchoredCandidate<T>(
  geometries: PaddleItemGeometry[],
  labels: string[],
  parse: (text: string) => T | null,
): PermitCandidate<T> | null {
  const labelItems = geometries.filter((item) =>
    permitLabelMatches(item.text, labels),
  )

  const candidates: PermitCandidate<T>[] = []

  for (const label of labelItems) {
    const direct = parse(label.text)
    if (direct !== null) {
      candidates.push({
        value: direct,
        score: label.score,
        rank: (label.score ?? 0) + 2,
      })
    }

    for (const item of geometries) {
      if (item === label) continue

      const value = parse(item.text)
      if (value === null) continue

      const positionRank = geometryDistanceRank(label, item)
      if (positionRank === null) continue

      candidates.push({
        value,
        score: item.score,
        rank: (item.score ?? 0) + positionRank,
      })
    }
  }

  return candidates.sort((a, b) => b.rank - a.rank)[0] ?? null
}

function extractHanNameFromPermitText(text: string) {
  let cleaned = text

  for (const label of [
    '姓名',
    'Name',
    'NAME',
  ]) {
    cleaned = cleaned.replaceAll(label, '')
  }

  cleaned = cleaned
    .replace(/\s+/g, '')
    .replace(/[，,。．.：:；;()（）\[\]【】]/g, '')

  const matches = cleaned.match(/[\p{Script=Han}·‧]{2,20}/gu)
  if (!matches) return null

  return (
    matches
      .map(normalizePermitChineseName)
      .find(isPlausiblePermitChineseName) ?? null
  )
}

interface PermitLatinName {
  surname: string
  givenNames: string
}

const permitEnglishStopWords = new Set([
  'TAIWAN',
  'RESIDENT',
  'MAINLAND',
  'TRAVEL',
  'PERMIT',
  'HOLDER',
  'PEOPLES',
  'REPUBLIC',
  'CHINA',
  'NAME',
  'SEX',
  'DATE',
  'BIRTH',
  'VALID',
  'EXPIRY',
  'AUTHORITY',
  'ISSUE',
  'NUMBER',
])

function extractPermitLatinName(
  text: string,
): PermitLatinName | null {
  const upper = text
    .toUpperCase()
    .replace(/[0-9]/g, ' ')
    .replace(/[^A-Z,\- ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!upper || upper.length < 5 || upper.length > 45) {
    return null
  }

  const tokens = upper
    .replace(/,/g, ' ')
    .split(/[\s\-]+/)
    .filter(Boolean)

  if (tokens.length < 2 || tokens.length > 5) {
    return null
  }

  if (
    tokens.some((token) =>
      permitEnglishStopWords.has(token),
    )
  ) {
    return null
  }

  if (!tokens.every((token) => token.length >= 2)) {
    return null
  }

  const commaIndex = upper.indexOf(',')

  if (commaIndex >= 0) {
    const surname = upper
      .slice(0, commaIndex)
      .replace(/[^A-Z]/g, '')
    const givenNames = upper
      .slice(commaIndex + 1)
      .replace(/[^A-Z\- ]/g, '')
      .trim()

    return surname && givenNames
      ? { surname, givenNames }
      : null
  }

  return {
    surname: tokens[0],
    givenNames: tokens.slice(1).join(' '),
  }
}

function choosePermitChineseName(
  geometries: PaddleItemGeometry[],
) {
  const labelAnchored = findLabelAnchoredCandidate(
    geometries,
    ['姓名', 'Name'],
    extractHanNameFromPermitText,
  )

  const latinAnchors = geometries
    .map((item) => ({
      item,
      parsed: extractPermitLatinName(item.text),
    }))
    .filter(
      (
        entry,
      ): entry is {
        item: PaddleItemGeometry
        parsed: PermitLatinName
      } => entry.parsed !== null,
    )

  const phoneticCandidates: Array<
    PermitCandidate<string>
  > = []

  for (const item of geometries) {
    const chineseName =
      extractHanNameFromPermitText(item.text)

    if (!chineseName) continue

    for (const anchor of latinAnchors) {
      const compatibility =
        compareChineseNameToMrzRomanization(
          chineseName,
          anchor.parsed.surname,
          anchor.parsed.givenNames,
        )

      if (compatibility === 'conflict') continue

      if (
        compatibility === 'unknown' &&
        (item.score ?? 0) < 0.78
      ) {
        continue
      }

      const scale = Math.max(
        1,
        item.height,
        anchor.item.height,
      )
      const vertical =
        Math.abs(
          item.centerY - anchor.item.centerY,
        ) / scale
      const horizontal =
        Math.abs(
          item.centerX - anchor.item.centerX,
        ) / scale

      // Chinese and romanized names are normally within the same visual
      // name group. This fallback does not require the tiny 姓名 label.
      if (vertical > 7 || horizontal > 20) continue

      phoneticCandidates.push({
        value: chineseName,
        score: item.score,
        rank:
          (item.score ?? 0) +
          (compatibility === 'compatible' ? 1.6 : 0.8) -
          vertical * 0.08 -
          horizontal * 0.015,
      })
    }
  }

  if (latinAnchors.length > 0) {
    // Once the document itself exposes a romanized personal name, do not
    // let a merely-nearby high-confidence Chinese location/authority label
    // outrank it. A Chinese candidate must survive the phonetic cross-check.
    return (
      phoneticCandidates
        .sort((a, b) => b.rank - a.rank)[0] ??
      null
    )
  }

  return labelAnchored
}

function extractPermitNumberFromText(text: string) {
  const digits = text.replace(/[^0-9]/g, '')

  // The visual zone may place the 2-digit issuance count immediately after
  // the lifelong 8-digit permit number. It is not part of the permit number.
  if (digits.length === 10) return digits.slice(0, 8)
  if (digits.length === 8) return digits

  const match = digits.match(/\d{8}/)
  return match?.[0] ?? null
}

function normalizePermitDateParts(
  year: number,
  month: number,
  day: number,
) {
  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-')
}

function extractPermitDatesFromText(text: string) {
  const dates: string[] = []

  const separated =
    /(19|20)(\d{2})\s*[年./\-]\s*(\d{1,2})\s*[月./\-]\s*(\d{1,2})\s*日?/g

  for (const match of text.matchAll(separated)) {
    const normalized = normalizePermitDateParts(
      Number(`${match[1]}${match[2]}`),
      Number(match[3]),
      Number(match[4]),
    )

    if (normalized) dates.push(normalized)
  }

  const compact = text.replace(/[^0-9]/g, '')

  for (const match of compact.matchAll(/(?:19|20)\d{6}/g)) {
    const value = match[0]
    const normalized = normalizePermitDateParts(
      Number(value.slice(0, 4)),
      Number(value.slice(4, 6)),
      Number(value.slice(6, 8)),
    )

    if (normalized && !dates.includes(normalized)) {
      dates.push(normalized)
    }
  }

  return dates
}

function extractSinglePermitDate(text: string) {
  return extractPermitDatesFromText(text)[0] ?? null
}

function extractPermitSex(text: string): PermitSex | null {
  const compact = text.replace(/\s+/g, '').toUpperCase()

  if (
    compact.includes('男') ||
    /(?:SEX|性别|性別)[:：]?M\b/.test(compact) ||
    compact === 'M'
  ) {
    return 'M'
  }

  if (
    compact.includes('女') ||
    /(?:SEX|性别|性別)[:：]?F\b/.test(compact) ||
    compact === 'F'
  ) {
    return 'F'
  }

  return null
}

function extractPermitBirthDateFromRows(
  rows: string[],
) {
  const joined = rows.join(' ')
  const datePattern =
    '(19|20)\\d{2}\\s*[年./\\-]\\s*\\d{1,2}\\s*[月./\\-]\\s*\\d{1,2}'

  const beforeLabel = new RegExp(
    `(${datePattern})\\s*(?:出生日期|出生|DATEOFBIRTH|DOB)`,
    'i',
  ).exec(joined.replace(/\s+/g, ''))

  if (beforeLabel?.[1]) {
    return extractSinglePermitDate(
      beforeLabel[1],
    )
  }

  const afterLabel = new RegExp(
    `(?:出生日期|出生|DATEOFBIRTH|DOB)[:：]?(${datePattern})`,
    'i',
  ).exec(joined.replace(/\s+/g, ''))

  return afterLabel?.[1]
    ? extractSinglePermitDate(afterLabel[1])
    : null
}

function extractPermitExpiryFromRows(
  rows: string[],
) {
  const joined = rows.join(' ')
  const compact = joined.replace(/\s+/g, '')

  // Typical front-side layout may OCR the whole row as:
  // 2025.10.02-2030.10.01有效期限1977.01.13出生日期
  // The later date in the validity interval is the expiry date.
  const validityPair =
    /((?:19|20)\d{2}[./\-]\d{1,2}[./\-]\d{1,2})\s*[-~～至]\s*((?:19|20)\d{2}[./\-]\d{1,2}[./\-]\d{1,2})\s*(?:有效期限|有效期|VALIDUNTIL|EXPIRY)/i.exec(
      compact,
    )

  if (validityPair?.[2]) {
    return extractSinglePermitDate(
      validityPair[2],
    )
  }

  const labelAfterDate =
    /((?:19|20)\d{2}[./\-]\d{1,2}[./\-]\d{1,2})\s*(?:有效期限|有效期|VALIDUNTIL|EXPIRY)/i.exec(
      compact,
    )

  if (labelAfterDate?.[1]) {
    return extractSinglePermitDate(
      labelAfterDate[1],
    )
  }

  const dateAfterLabel =
    /(?:有效期限|有效期|VALIDUNTIL|EXPIRY)[:：]?((?:19|20)\d{2}[./\-]\d{1,2}[./\-]\d{1,2})/i.exec(
      compact,
    )

  return dateAfterLabel?.[1]
    ? extractSinglePermitDate(dateAfterLabel[1])
    : null
}

function extractPermitSexFromRows(
  rows: string[],
): PermitSex | null {
  const compact = rows
    .join('')
    .replace(/\s+/g, '')
    .toUpperCase()

  if (
    /女(?:性别|性別)/.test(compact) ||
    /(?:性别|性別)[:：]?女/.test(compact) ||
    /(?:SEX)[:：]?F/.test(compact)
  ) {
    return 'F'
  }

  if (
    /男(?:性别|性別)/.test(compact) ||
    /(?:性别|性別)[:：]?男/.test(compact) ||
    /(?:SEX)[:：]?M/.test(compact)
  ) {
    return 'M'
  }

  return null
}

function buildTaiwanCompatriotPermitResult(
  prediction: unknown,
  initializationMs: number,
  predictMs: number,
  totalMs: number,
): TaiwanCompatriotPermitOcrResult {
  const typed = prediction as
    | { items?: unknown }
    | undefined

  const items =
    (typed?.items ?? []) as PaddleItemLike[]

  const geometries = items
    .map(toGeometry)
    .filter(
      (item): item is PaddleItemGeometry =>
        item !== null,
    )

  const rawRows = buildTextRows(items)
  const parsedMrz = parseTaiwanPermitMrz(rawRows)

  const name = choosePermitChineseName(geometries)

  let permitNumber = findLabelAnchoredCandidate(
    geometries,
    [
      '证件号码',
      '證件號碼',
      'Permit No',
      'Permit Number',
      '证件号',
      '證件號',
    ],
    extractPermitNumberFromText,
  )

  const semanticBirthDate =
    extractPermitBirthDateFromRows(rawRows)

  const semanticExpiryDate =
    extractPermitExpiryFromRows(rawRows)

  const semanticSex =
    extractPermitSexFromRows(rawRows)

  const birthDate = findLabelAnchoredCandidate(
    geometries,
    [
      '出生日期',
      'Date of Birth',
      'Birth Date',
      'DOB',
    ],
    extractSinglePermitDate,
  )

  const sex = findLabelAnchoredCandidate(
    geometries,
    ['性别', '性別', 'Sex'],
    extractPermitSex,
  )

  const expiryLabel = geometries.filter((item) =>
    permitLabelMatches(
      item.text,
      [
        '有效期限',
        '有效期',
        'Period of Validity',
        'Valid Until',
        'Expiry',
      ],
    ),
  )

  const expiryCandidates: PermitCandidate<string>[] = []

  for (const label of expiryLabel) {
    const directDates = extractPermitDatesFromText(label.text)

    if (directDates.length) {
      expiryCandidates.push({
        value: [...directDates].sort().at(-1)!,
        score: label.score,
        rank: (label.score ?? 0) + 2,
      })
    }

    for (const item of geometries) {
      if (item === label) continue

      const dates = extractPermitDatesFromText(item.text)
      if (!dates.length) continue

      const positionRank = geometryDistanceRank(label, item)
      if (positionRank === null) continue

      expiryCandidates.push({
        value: [...dates].sort().at(-1)!,
        score: item.score,
        rank: (item.score ?? 0) + positionRank,
      })
    }
  }

  let expiryDate =
    expiryCandidates.sort((a, b) => b.rank - a.rank)[0] ??
    null

  // Conservative fallbacks. They only produce suggestions; every permit
  // field still requires a full visual confirmation before saving.
  if (!permitNumber) {
    const globalNumber = geometries
      .map((item) => {
        const value = extractPermitNumberFromText(item.text)
        if (!value) return null
        if (/^(19|20)\d{6}$/.test(value)) return null

        return {
          value,
          score: item.score,
          rank: item.score ?? 0,
        }
      })
      .filter(
        (item): item is PermitCandidate<string> =>
          item !== null,
      )
      .filter((item) => (item.score ?? 0) >= 0.7)
      .sort((a, b) => b.rank - a.rank)[0]

    if (globalNumber) {
      permitNumber = globalNumber
    }
  }

  const allDates = geometries.flatMap((item) =>
    extractPermitDatesFromText(item.text).map((value) => ({
      value,
      score: item.score,
    })),
  )

  let inferredBirth = birthDate

  if (!inferredBirth && semanticBirthDate) {
    inferredBirth = {
      value: semanticBirthDate,
      score: null,
      rank: 3,
    }
  }

  if (!inferredBirth && allDates.length) {
    const today = new Date()
    const todayIso = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-')

    const plausibleBirths = allDates
      .filter((item) => item.value <= todayIso)
      .sort((a, b) => a.value.localeCompare(b.value))

    const first = plausibleBirths[0]
    if (first) {
      inferredBirth = {
        value: first.value,
        score: first.score,
        rank: first.score ?? 0,
      }
    }
  }

  if (
    semanticExpiryDate &&
    (
      !expiryDate ||
      expiryDate.value === inferredBirth?.value
    )
  ) {
    expiryDate = {
      value: semanticExpiryDate,
      score: null,
      rank: 4,
    }
  }

  if (!expiryDate && allDates.length) {
    const latest = [...allDates]
      .sort((a, b) => b.value.localeCompare(a.value))[0]

    if (latest) {
      expiryDate = {
        value: latest.value,
        score: latest.score,
        rank: latest.score ?? 0,
      }
    }
  }

  const scores = items
    .map((item) =>
      typeof item.score === 'number'
        ? item.score
        : null,
    )
    .filter((score): score is number => score !== null)

  const averageScore = scores.length
    ? scores.reduce((sum, score) => sum + score, 0) /
      scores.length
    : null

  const finalChineseName =
    parsedMrz?.chineseName ||
    name?.value ||
    ''

  const finalPermitNumber =
    parsedMrz?.permitNumber ||
    permitNumber?.value ||
    ''

  const finalBirthDate =
    parsedMrz?.birthDate ||
    inferredBirth?.value ||
    ''

  const finalSex =
    parsedMrz?.sex ||
    sex?.value ||
    semanticSex ||
    ''

  const finalExpiryDate =
    parsedMrz?.expiryDate ||
    semanticExpiryDate ||
    expiryDate?.value ||
    ''

  const extractedFieldCount = [
    finalChineseName,
    finalPermitNumber,
    finalBirthDate,
    finalSex,
    finalExpiryDate,
  ].filter(Boolean).length

  return {
    initializationMs,
    predictMs,
    totalMs,
    detectedItems: items.length,
    averageScore,
    chineseName: finalChineseName,
    permitNumber: finalPermitNumber,
    birthDate: finalBirthDate,
    sex: finalSex,
    expiryDate: finalExpiryDate,
    extractedFieldCount,
    fieldScores: {
      chineseName: name?.score ?? null,
      permitNumber: permitNumber?.score ?? null,
      birthDate: inferredBirth?.score ?? null,
      sex: sex?.score ?? null,
      expiryDate: expiryDate?.score ?? null,
    },
    rawRows,
    parsedMrz,
    mrzUsed: parsedMrz !== null,
    chineseNamePasses:
      parsedMrz?.chineseName || name?.value ? 1 : 0,
    chineseNameConsensus:
      parsedMrz?.chineseName || name?.value ? 1 : 0,
    chineseNameConfidence:
      parsedMrz?.chineseName
        ? (
            parsedMrz.validation.requiredValid
              ? 0.99
              : 0.9
          )
        : name?.score !== null && name?.score !== undefined
          ? Math.min(name.score, 0.85)
          : null,
    textHorizontalScore:
      estimateTextHorizontalScore(prediction),
    rotationDegrees: 0,
    orientationAttempts: 1,
    orientedImage: new File([], 'placeholder.png', {
      type: 'image/png',
    }),
  }
}

function normalizeRotation(degrees: number) {
  let value = degrees % 360
  if (value > 180) value -= 360
  if (value <= -180) value += 360
  return value
}

async function rotateImageFile(
  image: File,
  degrees: number,
) {
  const normalized = normalizeRotation(degrees)
  if (Math.abs(normalized) < 0.01) return image

  const bitmap = await createImageBitmap(image)
  const radians = (normalized * Math.PI) / 180
  const sin = Math.abs(Math.sin(radians))
  const cos = Math.abs(Math.cos(radians))

  const width = Math.ceil(
    bitmap.width * cos + bitmap.height * sin,
  )
  const height = Math.ceil(
    bitmap.width * sin + bitmap.height * cos,
  )

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('無法建立台胞證方向校正 Canvas。')
  }

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.translate(width / 2, height / 2)
  context.rotate(radians)
  context.drawImage(
    bitmap,
    -bitmap.width / 2,
    -bitmap.height / 2,
  )

  bitmap.close()

  const blob = await new Promise<Blob>(
    (resolve, reject) => {
      canvas.toBlob((value) => {
        if (value) resolve(value)
        else reject(
          new Error('無法產生方向校正後的台胞證圖片。'),
        )
      }, 'image/png')
    },
  )

  return new File(
    [blob],
    `permit-rotated-${Math.round(normalized)}.png`,
    { type: 'image/png' },
  )
}

function permitResultQuality(
  result: TaiwanCompatriotPermitOcrResult,
) {
  return (
    result.textHorizontalScore * 320 +
    (result.parsedMrz?.validation.requiredValid ? 1000 : 0) +
    (result.mrzUsed ? 100 : 0) +
    (result.chineseName ? 8 : 0) +
    (result.permitNumber ? 6 : 0) +
    (result.birthDate ? 4 : 0) +
    (result.expiryDate ? 4 : 0) +
    (result.sex ? 2 : 0) +
    Math.min(result.detectedItems, 30) * 0.03 +
    (result.averageScore ?? 0)
  )
}

function predictionItems(prediction: unknown) {
  const typed = prediction as
    | { items?: unknown }
    | undefined

  return (typed?.items ?? []) as PaddleItemLike[]
}

function dominantTextEdgeAngle(
  points: Array<[number, number]>,
) {
  if (points.length < 2) return null

  const edges = points.map((point, index) => {
    const next = points[(index + 1) % points.length]
    const dx = next[0] - point[0]
    const dy = next[1] - point[1]

    return {
      dx,
      dy,
      length: Math.hypot(dx, dy),
    }
  })

  const longest = edges.sort(
    (a, b) => b.length - a.length,
  )[0]

  if (!longest || longest.length < 8) {
    return null
  }

  return (
    Math.atan2(longest.dy, longest.dx) *
    180 /
    Math.PI
  )
}

function estimateTextHorizontalScore(
  prediction: unknown,
) {
  const scores = predictionItems(prediction)
    .flatMap((item) => {
      const points = pointsFromPoly(item.poly)
      const angle = dominantTextEdgeAngle(points)

      if (angle === null) return []

      let normalized = Math.abs(angle) % 180
      if (normalized > 90) {
        normalized = 180 - normalized
      }

      const longestEdge = points
        .map((point, index) => {
          const next =
            points[(index + 1) % points.length]

          return Math.hypot(
            next[0] - point[0],
            next[1] - point[1],
          )
        })
        .sort((a, b) => b - a)[0] ?? 0

      if (longestEdge < 16) return []

      // 1.0 = text baseline horizontal, 0.0 = vertical.
      const horizontal =
        Math.max(0, 1 - normalized / 90)

      return [
        {
          score: horizontal,
          weight: Math.min(
            5,
            Math.max(1, longestEdge / 80),
          ),
        },
      ]
    })

  if (!scores.length) return 0.5

  const totalWeight = scores.reduce(
    (sum, item) => sum + item.weight,
    0,
  )

  return scores.reduce(
    (sum, item) =>
      sum + item.score * item.weight,
    0,
  ) / totalWeight
}

function estimateTextSkewDegrees(
  prediction: unknown,
) {
  const angles = predictionItems(prediction)
    .flatMap((item) => {
      const points = pointsFromPoly(item.poly)
      const edgeAngle =
        dominantTextEdgeAngle(points)

      if (edgeAngle === null) return []

      let angle = edgeAngle

      // Deskew only measures the small residual tilt around a horizontal
      // baseline. Cardinal 90° orientation is handled separately.
      while (angle > 90) angle -= 180
      while (angle < -90) angle += 180

      if (angle > 45) angle -= 90
      if (angle < -45) angle += 90

      return Math.abs(angle) <= 20
        ? [angle]
        : []
    })
    .sort((a, b) => a - b)

  if (angles.length < 4) return 0

  const middle = Math.floor(angles.length / 2)
  const median =
    angles.length % 2
      ? angles[middle]
      : (angles[middle - 1] + angles[middle]) / 2

  return Math.abs(median) >= 2.5
    ? median
    : 0
}

async function predictPermit(
  instance: PaddleInstance,
  image: File,
  initializationMs: number,
  totalStartedAt: number,
) {
  const startedAt = performance.now()
  const [prediction] = await instance.predict(image)
  const predictMs = performance.now() - startedAt

  const result = buildTaiwanCompatriotPermitResult(
    prediction,
    initializationMs,
    predictMs,
    performance.now() - totalStartedAt,
  )

  result.orientedImage = image

  return {
    prediction,
    result,
  }
}

async function createPermitNameGroupCrop(
  image: File,
  prediction: unknown,
) {
  const bitmap = await createImageBitmap(image)
  const imageWidth = bitmap.width
  const imageHeight = bitmap.height
  bitmap.close()

  const geometries = predictionItems(prediction)
    .map(toGeometry)
    .filter(
      (item): item is PaddleItemGeometry =>
        item !== null && item.height > 0,
    )

  const latinAnchors = geometries
    .map((item) => ({
      item,
      parsed: extractPermitLatinName(item.text),
    }))
    .filter(
      (
        entry,
      ): entry is {
        item: PaddleItemGeometry
        parsed: PermitLatinName
      } => entry.parsed !== null,
    )
    .sort(
      (a, b) =>
        (b.item.score ?? 0) - (a.item.score ?? 0),
    )

  const labelAnchors = geometries
    .filter((item) =>
      permitLabelMatches(item.text, ['姓名', 'Name']),
    )
    .sort(
      (a, b) =>
        (b.score ?? 0) - (a.score ?? 0),
    )

  const anchor =
    latinAnchors[0]?.item ??
    labelAnchors[0] ??
    null

  if (!anchor) return null

  const h = Math.max(10, anchor.height)
  const x = Math.max(
    0,
    anchor.minX - h * 5,
  )
  const y = Math.max(
    0,
    anchor.minY - h * 5.5,
  )

  const width = Math.min(
    imageWidth - x,
    Math.max(
      anchor.maxX - anchor.minX + h * 12,
      imageWidth * 0.58,
    ),
  )
  const height = Math.min(
    imageHeight - y,
    Math.max(
      h * 11,
      imageHeight * 0.24,
    ),
  )

  const blob = await createPixelCrop(
    image,
    x,
    y,
    width,
    height,
    1500,
  )

  return new File(
    [blob],
    'permit-name-group.png',
    { type: 'image/png' },
  )
}

async function retryPermitChineseName(
  instance: PaddleInstance,
  image: File,
  prediction: unknown,
) {
  const crops: File[] = []

  const anchored = await createPermitNameGroupCrop(
    image,
    prediction,
  )

  if (anchored) {
    crops.push(anchored)
  }

  const broadBlob = await createRelativeCrop(
    image,
    0.08,
    0.06,
    0.84,
    0.72,
  )

  crops.push(
    new File(
      [broadBlob],
      'permit-name-broad.png',
      { type: 'image/png' },
    ),
  )

  const candidates: Array<
    PermitCandidate<string>
  > = []

  for (const crop of crops) {
    const [namePrediction] =
      await instance.predict(crop)

    const geometries =
      predictionItems(namePrediction)
        .map(toGeometry)
        .filter(
          (
            item,
          ): item is PaddleItemGeometry =>
            item !== null,
        )

    const candidate =
      choosePermitChineseName(geometries)

    if (candidate) candidates.push(candidate)
  }

  if (!candidates.length) return null

  const grouped = new Map<
    string,
    Array<PermitCandidate<string>>
  >()

  for (const candidate of candidates) {
    const key = normalizePermitChineseName(
      candidate.value,
    )
    const group = grouped.get(key) ?? []
    group.push(candidate)
    grouped.set(key, group)
  }

  return [...grouped.entries()]
    .map(([value, group]) => {
      const bestScore = Math.max(
        ...group.map((item) => item.score ?? 0),
      )
      const consensus = group.length
      const confidence = Math.min(
        0.99,
        bestScore + (consensus >= 2 ? 0.06 : 0),
      )

      return {
        value,
        score: bestScore,
        rank: consensus * 2 + bestScore,
        passes: crops.length,
        consensus,
        confidence,
      }
    })
    .sort((a, b) => b.rank - a.rank)[0]
}

export async function recognizeTaiwanCompatriotPermitWithPaddle(
  image: File,
  onProgress?: (
    progress: TaiwanCompatriotPermitOcrProgress,
  ) => void,
): Promise<TaiwanCompatriotPermitOcrResult> {
  const totalStartedAt = performance.now()
  onProgress?.({
    stage: 'initializing',
    progress: 0.05,
    message: '正在準備 PaddleOCR…',
  })

  const { instance, initializationMs } = await getPaddle()

  const attempts: Array<{
    rotation: number
    image: File
    prediction: unknown
    result: TaiwanCompatriotPermitOcrResult
  }> = []

  const tryRotation = async (
    rotation: number,
    progress: number,
  ) => {
    onProgress?.({
      stage: 'orientation',
      progress,
      message:
        rotation === 0
          ? '正在辨識原始方向…'
          : `正在測試旋轉 ${rotation}° 的方向…`,
    })

    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    )

    const rotated =
      await rotateImageFile(image, rotation)
    const predicted = await predictPermit(
      instance,
      rotated,
      attempts.length === 0
        ? initializationMs
        : 0,
      totalStartedAt,
    )

    predicted.result.rotationDegrees = rotation
    predicted.result.orientationAttempts =
      attempts.length + 1

    attempts.push({
      rotation,
      image: rotated,
      prediction: predicted.prediction,
      result: predicted.result,
    })

    return predicted.result
  }

  const original = await tryRotation(0, 0.16)

  const strongEnough =
    original.parsedMrz?.validation.requiredValid === true ||
    (
      original.extractedFieldCount >= 4 &&
      Boolean(original.chineseName) &&
      Boolean(original.permitNumber)
    )

  if (!strongEnough) {
    await tryRotation(90, 0.34)
    await tryRotation(-90, 0.52)

    const currentBest = [...attempts].sort(
      (a, b) =>
        permitResultQuality(b.result) -
        permitResultQuality(a.result),
    )[0]

    if (
      (
        currentBest.result.parsedMrz?.validation.requiredValid !== true &&
        currentBest.result.extractedFieldCount < 4
      ) ||
      !currentBest.result.chineseName
    ) {
      await tryRotation(180, 0.66)
    }
  }

  let best = [...attempts].sort(
    (a, b) =>
      permitResultQuality(b.result) -
      permitResultQuality(a.result),
  )[0]

  // After the best cardinal direction is known, estimate a small remaining
  // camera tilt from OCR text boxes and deskew once.
  const skew =
    estimateTextSkewDegrees(best.prediction)

  if (Math.abs(skew) >= 2.5 && Math.abs(skew) <= 20) {
    onProgress?.({
      stage: 'deskew',
      progress: 0.78,
      message:
        `偵測到約 ${Math.abs(skew).toFixed(1)}° 傾斜，正在校正…`,
    })

    const deskewed = await rotateImageFile(
      best.image,
      -skew,
    )
    const deskewPrediction = await predictPermit(
      instance,
      deskewed,
      0,
      totalStartedAt,
    )

    deskewPrediction.result.rotationDegrees =
      normalizeRotation(best.rotation - skew)
    deskewPrediction.result.orientationAttempts =
      attempts.length + 1

    if (
      permitResultQuality(deskewPrediction.result) >=
      permitResultQuality(best.result)
    ) {
      best = {
        rotation:
          deskewPrediction.result.rotationDegrees,
        image: deskewed,
        prediction: deskewPrediction.prediction,
        result: deskewPrediction.result,
      }
    }
  }

  if (!best.result.chineseName && !best.result.mrzUsed) {
    onProgress?.({
      stage: 'name-retry',
      progress: 0.9,
      message: '姓名尚未取得，正在放大姓名區域重試…',
    })

    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    )

    const retriedName = await retryPermitChineseName(
      instance,
      best.image,
      best.prediction,
    )

    if (retriedName) {
      best.result.chineseName = retriedName.value
      best.result.fieldScores.chineseName =
        retriedName.score
      best.result.chineseNamePasses =
        retriedName.passes
      best.result.chineseNameConsensus =
        retriedName.consensus
      best.result.chineseNameConfidence =
        retriedName.confidence
      best.result.extractedFieldCount = [
        best.result.chineseName,
        best.result.permitNumber,
        best.result.birthDate,
        best.result.sex,
        best.result.expiryDate,
      ].filter(Boolean).length
    }
  }

  best.result.orientationAttempts =
    Math.max(
      best.result.orientationAttempts,
      attempts.length,
    )
  best.result.totalMs =
    performance.now() - totalStartedAt

  onProgress?.({
    stage: 'completed',
    progress: 1,
    message:
      Math.abs(best.result.rotationDegrees) < 1
        ? '辨識完成。'
        : `辨識完成，已自動校正方向 ${best.result.rotationDegrees.toFixed(1)}°。`,
  })

  return best.result
}


export type DetectedDocumentType =
  | 'passport'
  | 'taiwan-compatriot-permit'
  | 'tw-id'
  | 'unknown'

export interface DocumentTypeDetectionResult {
  type: DetectedDocumentType
  confidence: 'high' | 'medium' | 'low'
  evidence: string[]
}

function classifyDocumentFromItems(
  items: PaddleItemLike[],
): DocumentTypeDetectionResult {
  const rows = buildTextRows(items)
  const joined = rows
    .join('\n')
    .toUpperCase()

  const compactChinese = rows
    .join('')
    .replace(/\s+/g, '')

  const evidence: string[] = []

  const permitMrz = parseTaiwanPermitMrz(rows)

  if (permitMrz) {
    evidence.push('偵測到台胞證 3 × 30 機讀碼')

    return {
      type: 'taiwan-compatriot-permit',
      confidence:
        permitMrz.validation.requiredValid
          ? 'high'
          : 'medium',
      evidence,
    }
  }

  const permitText =
    /台[灣湾]居民[來来]往大[陸陆]通行[證证]/.test(
      compactChinese,
    ) ||
    joined.includes(
      'TAIWAN RESIDENT',
    ) ||
    joined.includes(
      'TRAVEL TO THE MAINLAND OF CHINA',
    )

  if (permitText) {
    evidence.push('偵測到台胞證標題／固定文字')

    return {
      type: 'taiwan-compatriot-permit',
      confidence: 'high',
      evidence,
    }
  }

  const passportMrzLike = rows.some((row) => {
    const normalized = row
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/[^A-Z0-9<]/g, '')

    return (
      normalized.startsWith('P<') &&
      normalized.length >= 38
    )
  })

  const passportText =
    joined.includes('PASSPORT') ||
    /護照|护照/.test(compactChinese)

  if (passportMrzLike || passportText) {
    if (passportMrzLike) {
      evidence.push('偵測到護照 P< MRZ')
    }

    if (passportText) {
      evidence.push('偵測到護照固定文字')
    }

    return {
      type: 'passport',
      confidence:
        passportMrzLike
          ? 'high'
          : 'medium',
      evidence,
    }
  }

  const idText =
    /(?:中華民國)?國民身分證/.test(
      compactChinese,
    ) ||
    /(?:中华人民共和国)?居民身份证/.test(
      compactChinese,
    ) ||
    joined.includes('IDENTITY CARD')

  if (idText) {
    evidence.push('偵測到身分證固定文字')

    return {
      type: 'tw-id',
      confidence: 'high',
      evidence,
    }
  }

  return {
    type: 'unknown',
    confidence: 'low',
    evidence: [],
  }
}

export async function detectDocumentTypeWithPaddle(
  image: File,
): Promise<DocumentTypeDetectionResult> {
  const { instance } = await getPaddle()

  const rotations = [0, 90, -90]

  for (const rotation of rotations) {
    const candidate =
      rotation === 0
        ? image
        : await rotateImageFile(
            image,
            rotation,
          )

    const [prediction] =
      await instance.predict(candidate)

    const result = classifyDocumentFromItems(
      predictionItems(prediction),
    )

    if (
      result.type !== 'unknown' &&
      result.confidence !== 'low'
    ) {
      return result
    }
  }

  return {
    type: 'unknown',
    confidence: 'low',
    evidence: [],
  }
}
