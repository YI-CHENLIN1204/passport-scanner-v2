import { PaddleOCR } from '@paddleocr/paddleocr-js'
import { summarizePermitRetryDetection, type PermitRetryDetectionSummary } from './permitRetryDetection'
import { selectPermitRetryWinner, type PermitNameRetryRegion } from './permitNameRetryEvidence'
import { selectPermitRawNameCandidate, type PermitRawNameCompatibility } from './permitRawNameEvidence'
import {
  isPlausibleTd3Line1,
  normalizeMrzCandidate,
  normalizeTd3Line1,
  parseTd3Mrz,
  repairTd3Line2,
  validateTd3Line2,
  recognizePassport as recognizePassportWithTesseract,
  type MrzRepairInfo,
  type MrzValidation,
  type ParsedMrz,
} from './ocr'
import {
  compareChineseNameToMrzRomanization,
  compareChineseNameToMrzWithOfficialVariants,
  classifyRomanizationConflict,
  type RomanizationCompatibility,
} from './nameRomanization'
import { guardedOfficialNameSuggestion } from './officialNameSuggestion'
import { choosePermitNameCropAnchor } from './permitNameCropAnchor'
import {
  shouldRetryUncertainPermitName,
  shouldUseRetriedPermitName,
} from './permitNameRetryPolicy'
import {
  selectPermitNameCandidate,
  selectPermitSexCandidate,
  selectPermitMrzVsVisualName,
} from './permitFieldEvidence'
import {
  parseTaiwanPermitMrz,
  type ParsedTaiwanPermitMrz,
} from './taiwanPermitMrz'

type PaddleInstance = Awaited<ReturnType<typeof PaddleOCR.create>>
export type ValidationPaddleInstance = PaddleInstance

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
  points: Array<[number, number]>
}

export type PassportNameDecisionReason =
  | 'selected'
  | 'no-anchor'
  | 'romanization-conflict'
  | 'below-confidence'
  | 'unknown-threshold'
  | 'lower-rank'

export interface PassportNameDecision {
  text: string
  reason: PassportNameDecisionReason
  conflictSubtype?:
    | 'token-count-mismatch'
    | 'one-syllable-mismatch'
    | 'other-mismatch'
    | 'unclassified'
}

export interface PassportChineseNameDiagnostic {
  source: 'name-field' | 'viz-crop'
  rawTexts: string[]
  candidateTexts: string[]
  decisionTrace?: PassportNameDecision[]
  shadowOneMismatchName?: string | null
  shadowOfficialName?: string | null
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
  chineseNameDiagnostics: PassportChineseNameDiagnostic[]
  structureComplete: boolean
  fallbackUsed: boolean
  fallbackCropRatio: number | null
  runtime: string
  rotationDegrees?: number
  orientationAttempts?: number
  detectedSkewDegrees?: number
  textHorizontalScore?: number
  uprightSemanticScore?: number
  distanceCropUsed?: boolean
  distanceCropLabel?: string | null
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
      points: [],
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
    points,
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
  trace?: (
    decisions: PassportNameDecision[],
    shadowName: string | null,
    officialName: string | null,
  ) => void,
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

  // Read-only counterfactual: do not change the production return path.
  const shadowAllowed = (candidate: {
    text: string
    score: number
    romanizationStatus: RomanizationCompatibility
    rank: number
  }) => candidate.romanizationStatus !== 'conflict' ||
    (parsedMrz !== null &&
      classifyRomanizationConflict(candidate.text, parsedMrz.surname,
        parsedMrz.givenNames) === 'one-syllable-mismatch')

  const selectShadow = (candidates: Array<{
    text: string
    score: number
    romanizationStatus: RomanizationCompatibility
    rank: number
  }>) => {
    const picked = candidates.filter(shadowAllowed)
      .sort((a, b) => b.rank - a.rank)[0]
    if (!picked || picked.score < 0.65) return null
    // Relaxed candidates are NOT phonetically approved; retain the
    // existing unknown confidence/rank safeguard.
    if (parsedMrz && picked.romanizationStatus !== 'compatible' &&
      (picked.score < 0.78 || picked.rank < 1.35)) return null
    return picked.text
  }

  // Official-alias counterfactual: keep existing geometry, scoring and
  // confidence gates, changing only *exact* source-checked phonetic aliases.
  // This method is invoked only when the Validation trace is requested.
  const selectOfficialShadow = (candidates: Array<{
    text: string
    score: number
    romanizationStatus: RomanizationCompatibility
    rank: number
  }>, requireCompatible = false) => {
    const alternatives = candidates.map(candidate => {
      const officialStatus = parsedMrz
        ? compareChineseNameToMrzWithOfficialVariants(
            candidate.text,
            parsedMrz.surname,
            parsedMrz.givenNames,
          )
        : 'unknown'
      return {
        ...candidate,
        officialStatus,
        adjustedRank: candidate.rank +
          (candidate.romanizationStatus !== 'compatible' &&
            officialStatus === 'compatible' ? 1.5 : 0),
      }
    }).filter(candidate => candidate.officialStatus !== 'conflict' &&
      (!requireCompatible || candidate.officialStatus === 'compatible'))
      .sort((a, b) => b.adjustedRank - a.adjustedRank)

    const picked = alternatives[0]
    if (!picked || picked.score < 0.65) return null
    if (parsedMrz && picked.officialStatus === 'unknown' &&
      (picked.score < 0.78 || picked.adjustedRank < 1.35)) return null
    return picked.text
  }

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
        candidate => candidate.romanizationStatus === 'compatible',
      )
      .sort((a, b) => b.rank - a.rank)[0]

    if (trace) {
      trace(geometries
        .filter(item => isPlausibleTaiwanChineseName(item.normalized))
        .map(item => {
          const matches = directLabelValues.filter(
            candidate => candidate.text === item.normalized,
          )
          const reason: PassportNameDecisionReason =
            !matches.length
              ? 'no-anchor'
              : matches.every(candidate =>
                  candidate.romanizationStatus !== 'compatible')
                ? 'romanization-conflict'
                : direct?.text === item.normalized &&
                    direct.score >= 0.65
                  ? 'selected'
                  : matches.every(candidate => candidate.score < 0.65)
                    ? 'below-confidence'
                    : 'lower-rank'
          return {
            text: item.normalized,
            reason,
            conflictSubtype:
              reason === 'romanization-conflict' && parsedMrz
                ? classifyRomanizationConflict(
                    item.normalized,
                    parsedMrz.surname,
                    parsedMrz.givenNames,
                  )
                : undefined,
          }
        }), selectShadow(directLabelValues),
        selectOfficialShadow(directLabelValues, true))
    }

    return direct && direct.score >= 0.65
      ? direct
      : guardedOfficialNameSuggestion(directLabelValues, parsedMrz)
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

  if (trace) {
    const possible = new Set([
      ...geometries
        .filter(item => isPlausibleTaiwanChineseName(item.normalized))
        .map(item => item.normalized),
      ...directLabelValues.map(candidate => candidate.text),
    ])
    trace(Array.from(possible, text => {
      const options = [
        ...directLabelValues,
        ...spatialCandidates,
      ].filter(candidate => candidate.text === text)
      const valid = options.filter(
        candidate => candidate.romanizationStatus !== 'conflict',
      )
      const chosen = valid.some(candidate => candidate === best)
      const blockedUnknown =
        Boolean(parsedMrz) &&
        best?.romanizationStatus === 'unknown' &&
        (best.score < 0.78 || best.rank < 1.35)

      const reason: PassportNameDecisionReason =
        !options.length
          ? 'no-anchor'
          : !valid.length
            ? 'romanization-conflict'
            : chosen && best.score < 0.65
              ? 'below-confidence'
              : chosen && blockedUnknown
                ? 'unknown-threshold'
                : chosen
                  ? 'selected'
                  : valid.every(candidate => candidate.score < 0.65)
                    ? 'below-confidence'
                    : 'lower-rank'
      return {
        text,
        reason,
        conflictSubtype:
          reason === 'romanization-conflict' && parsedMrz
            ? classifyRomanizationConflict(
                text,
                parsedMrz.surname,
                parsedMrz.givenNames,
              )
            : undefined,
      }
    }), selectShadow([...directLabelValues, ...spatialCandidates]),
      selectOfficialShadow([...directLabelValues, ...spatialCandidates]))
  }

  if (!best || best.score < 0.65) {
    return guardedOfficialNameSuggestion(
      [...directLabelValues, ...spatialCandidates], parsedMrz,
    )
  }

  if (
    parsedMrz &&
    best.romanizationStatus === 'conflict'
  ) {
    return null
  }

  // Taiwan passports legitimately use multiple romanization systems.
  // When the OCR candidate is spatially strong but our phonetic helper
  // cannot prove compatibility, keep it as a review suggestion instead of
  // turning a visible Chinese name into a blank field. Human review remains
  // mandatory, while explicit romanization conflicts are still rejected.
  if (
    parsedMrz &&
    best.romanizationStatus === 'unknown' &&
    (
      best.score < 0.78 ||
      best.rank < 1.35
    )
  ) {
    return guardedOfficialNameSuggestion(
      [...directLabelValues, ...spatialCandidates], parsedMrz,
    )
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

export const OCR_PIPELINE_VERSION =
  '2026.10.11.11'

const paddleModelAssetVersion =
  'ppocrv5-onnx-20261003-canonical-3'

interface PaddleModelSource {
  label: string
  detectionUrl: string
  recognitionUrl: string
}

const paddleModelSources: PaddleModelSource[] = [
  {
    label: 'official',
    detectionUrl:
      `${paddleModelBaseUrl}/paddlex/official_inference_model/paddle3.0.0/PP-OCRv5_mobile_det_onnx_infer.tar?v=${paddleModelAssetVersion}`,
    recognitionUrl:
      `${paddleModelBaseUrl}/paddlex/official_inference_model/paddle3.0.0/PP-OCRv5_mobile_rec_onnx_infer.tar?v=${paddleModelAssetVersion}`,
  },
]

function createPaddleFromSource(
  source: PaddleModelSource,
) {
  return PaddleOCR.create({
    lang: 'chinese_cht',
    ocrVersion: 'PP-OCRv5',
    textDetectionModelName: 'PP-OCRv5_mobile_det',
    textDetectionModelAsset: {
      url: source.detectionUrl,
    },
    textRecognitionModelName: 'PP-OCRv5_mobile_rec',
    textRecognitionModelAsset: {
      url: source.recognitionUrl,
    },
    ortOptions: {
      backend: 'auto',
    },
  })
}

// Opt-in Validation experiment. Never used by production scan flow.
// Reuse exact PP-OCRv5 model assets, but keep runtime and lifecycle separate.
export function createValidationPaddleInstance(
  worker: boolean,
): Promise<ValidationPaddleInstance> {
  const source = paddleModelSources[0]

  return PaddleOCR.create({
    lang: 'chinese_cht',
    ocrVersion: 'PP-OCRv5',
    textDetectionModelName: 'PP-OCRv5_mobile_det',
    textDetectionModelAsset: {
      url: source.detectionUrl,
    },
    textRecognitionModelName: 'PP-OCRv5_mobile_rec',
    textRecognitionModelAsset: {
      url: source.recognitionUrl,
    },
    worker,
    ortOptions: {
      backend: 'wasm',
      numThreads: 1,
      wasmPaths: '/ort-wasm/',
    },
  })
}

function isInvalidModelArchive(error: unknown) {
  return (
    error instanceof Error &&
    /inference\.onnx|inference\.yml|tar archive|model_name/i.test(
      error.message,
    )
  )
}

function createPaddlePromise() {
  paddlePromise = (async () => {
    let lastError: unknown = null

    for (const source of paddleModelSources) {
      try {
        return await createPaddleFromSource(source)
      } catch (error) {
        lastError = error

        if (
          !isFetchFailure(error) &&
          !isInvalidModelArchive(error)
        ) {
          throw error
        }

        console.warn(
          `PaddleOCR model source "${source.label}" failed; trying the next source.`,
          error,
        )
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('PaddleOCR 模型初始化失敗。')
  })()
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

  if (isInvalidModelArchive(lastError)) {
    throw new Error(
      'PaddleOCR 模型檔格式異常。若目前使用 Docker，請確認 frontend Nginx 已代理 /paddle-models/，再重新整理頁面重試。',
    )
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('PaddleOCR 初始化失敗。')
}

export async function warmupPaddleOcr() {
  await getPaddle()
}

// Read-only runtime metadata for Validation diagnostics. Never runs OCR
// or changes an already initialized production model.
export function getValidationPaddleRuntimeSummary(
  experimentalInstance?: ValidationPaddleInstance,
) {
  const initialized = experimentalInstance ?? paddleInstance
  const summary = initialized?.getInitializationSummary()
  if (!summary) return null
  return {
    backend: summary.backend,
    detProvider: summary.detProvider,
    recProvider: summary.recProvider,
    webgpuAvailable: summary.webgpuAvailable,
  }
}

function geometryFirstMatching(
  prediction: unknown,
  predicate: (text: string) => boolean,
) {
  return predictionItems(prediction)
    .map(toGeometry)
    .filter(
      (item): item is PaddleItemGeometry =>
        item !== null && item.height > 0,
    )
    .filter((item) => predicate(item.text))
    .sort((a, b) => a.centerY - b.centerY)[0] ?? null
}

function semanticOrderScore(
  pairs: Array<
    [
      PaddleItemGeometry | null,
      PaddleItemGeometry | null,
    ]
  >,
) {
  const available = pairs.filter(
    (
      pair,
    ): pair is [
      PaddleItemGeometry,
      PaddleItemGeometry,
    ] => pair[0] !== null && pair[1] !== null,
  )

  if (!available.length) return 0.5

  const passed = available.filter(
    ([upper, lower]) =>
      upper.centerY < lower.centerY,
  ).length

  return passed / available.length
}

function estimatePassportUprightScore(
  prediction: unknown,
) {
  const title = geometryFirstMatching(
    prediction,
    (text) =>
      /PASSPORT|護照|护照/i.test(text),
  )

  const mrzLine1 = geometryFirstMatching(
    prediction,
    (text) => {
      const normalized =
        normalizeMrzCandidate(text)

      return (
        normalized.startsWith('P') &&
        normalized.length >= 30
      )
    },
  )

  const mrzLine2 = geometryFirstMatching(
    prediction,
    (text) => {
      const normalized =
        normalizeMrzCandidate(text)

      return (
        !normalized.startsWith('P') &&
        normalized.length >= 30 &&
        /\d/.test(normalized)
      )
    },
  )

  return semanticOrderScore([
    [title, mrzLine1],
    [title, mrzLine2],
    [mrzLine1, mrzLine2],
  ])
}

function estimatePermitUprightScore(
  prediction: unknown,
) {
  const title = geometryFirstMatching(
    prediction,
    (text) =>
      /台[灣湾]居民[來来]往大[陸陆]通行[證证]|TAIWAN\s*RESIDENT/i.test(
        text.replace(/\s+/g, ''),
      ),
  )

  const birth = geometryFirstMatching(
    prediction,
    (text) => /出生|DOB|DATEOFBIRTH/i.test(text),
  )

  const expiry = geometryFirstMatching(
    prediction,
    (text) => /有效|EXPIRY|VALIDUNTIL/i.test(text),
  )

  const number = geometryFirstMatching(
    prediction,
    (text) =>
      Boolean(extractPermitNumberFromText(text)),
  )

  const mrz = geometryFirstMatching(
    prediction,
    (text) =>
      /<{3,}/.test(text) &&
      text.replace(/\s+/g, '').length >= 20,
  )

  if (mrz) {
    const geometries = predictionItems(prediction)
      .map(toGeometry)
      .filter(
        (item): item is PaddleItemGeometry =>
          item !== null && item.height > 0,
      )

    const medianY = geometries.length
      ? [...geometries]
          .sort((a, b) => a.centerY - b.centerY)[
            Math.floor(geometries.length / 2)
          ].centerY
      : mrz.centerY

    return mrz.centerY >= medianY
      ? 1
      : 0
  }

  return semanticOrderScore([
    [title, birth],
    [title, expiry],
    [title, number],
  ])
}

function estimateTaiwanIdUprightScore(
  prediction: unknown,
) {
  const title = geometryFirstMatching(
    prediction,
    (text) =>
      /中華民國.*身分證|中華民國.*身分证|國民身分證|国民身份证/.test(
        text.replace(/\s+/g, ''),
      ),
  )

  const name = geometryFirstMatching(
    prediction,
    (text) => /姓名/.test(text),
  )

  const birth = geometryFirstMatching(
    prediction,
    (text) => /出生|年月日/.test(text),
  )

  const idNumber = geometryFirstMatching(
    prediction,
    (text) =>
      Boolean(extractTaiwanNationalIdFromText(text)),
  )

  return semanticOrderScore([
    [title, name],
    [title, birth],
    [title, idNumber],
    [name, birth],
    [birth, idNumber],
  ])
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
    chineseNameDiagnostics: [],
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
    uprightSemanticScore:
      estimatePassportUprightScore(prediction),
    distanceCropUsed: false,
    distanceCropLabel: null,
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

  // Clamp source origins before computing remaining width/height.
  // Some weak OCR anchors can be just outside the decoded bitmap.
  const x = Math.max(0, Math.min(bitmap.width - 1, Math.floor(sourceX)))
  const y = Math.max(0, Math.min(bitmap.height - 1, Math.floor(sourceY)))
  const width = Math.max(
    1,
    Math.min(bitmap.width - x, Math.floor(sourceWidth)),
  )
  const height = Math.max(
    1,
    Math.min(bitmap.height - y, Math.floor(sourceHeight)),
  )

  // Prevent oversized canvas allocation and extreme interpolation for
  // tiny/OCR-distant crops. Keep existing 1800px ceiling.
  const targetWidth = Math.min(
    1800,
    Math.max(width, Math.min(minimumTargetWidth, width * 2.5)),
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

type DocumentQuad = {
  topLeft: [number, number]
  topRight: [number, number]
  bottomRight: [number, number]
  bottomLeft: [number, number]
}

function distanceBetween(
  a: [number, number],
  b: [number, number],
) {
  return Math.hypot(
    b[0] - a[0],
    b[1] - a[1],
  )
}

function polygonArea(
  points: Array<[number, number]>,
) {
  let sum = 0

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next =
      points[(index + 1) % points.length]

    sum +=
      current[0] * next[1] -
      next[0] * current[1]
  }

  return Math.abs(sum) / 2
}

function lineIntersection(
  first:
    | { axis: 'horizontal'; slope: number; intercept: number }
    | { axis: 'vertical'; slope: number; intercept: number },
  second:
    | { axis: 'horizontal'; slope: number; intercept: number }
    | { axis: 'vertical'; slope: number; intercept: number },
): [number, number] | null {
  if (first.axis === second.axis) return null

  const horizontal =
    first.axis === 'horizontal'
      ? first
      : second as {
          axis: 'horizontal'
          slope: number
          intercept: number
        }

  const vertical =
    first.axis === 'vertical'
      ? first
      : second as {
          axis: 'vertical'
          slope: number
          intercept: number
        }

  // y = mh*x + bh
  // x = mv*y + bv
  const denominator =
    1 - vertical.slope * horizontal.slope

  if (Math.abs(denominator) < 1e-6) {
    return null
  }

  const x =
    (
      vertical.slope * horizontal.intercept +
      vertical.intercept
    ) / denominator

  const y =
    horizontal.slope * x +
    horizontal.intercept

  return [x, y]
}

function scoreHorizontalEdgeLine(
  gradient: Float32Array,
  width: number,
  height: number,
  xStart: number,
  xEnd: number,
  slope: number,
  intercept: number,
) {
  let score = 0
  let samples = 0
  let strong = 0

  const start = Math.max(1, Math.floor(xStart))
  const end = Math.min(width - 2, Math.ceil(xEnd))

  for (let x = start; x <= end; x += 2) {
    const y = Math.round(slope * x + intercept)
    if (y < 2 || y >= height - 2) continue

    let local = 0
    for (let offset = -2; offset <= 2; offset += 1) {
      local = Math.max(
        local,
        gradient[(y + offset) * width + x],
      )
    }

    score += local
    if (local >= 70) strong += 1
    samples += 1
  }

  if (!samples) return 0

  const continuity = strong / samples
  return score / samples * (0.55 + continuity * 0.9)
}

function scoreVerticalEdgeLine(
  gradient: Float32Array,
  width: number,
  height: number,
  yStart: number,
  yEnd: number,
  slope: number,
  intercept: number,
) {
  let score = 0
  let samples = 0
  let strong = 0

  const start = Math.max(1, Math.floor(yStart))
  const end = Math.min(height - 2, Math.ceil(yEnd))

  for (let y = start; y <= end; y += 2) {
    const x = Math.round(slope * y + intercept)
    if (x < 2 || x >= width - 2) continue

    let local = 0
    for (let offset = -2; offset <= 2; offset += 1) {
      local = Math.max(
        local,
        gradient[y * width + x + offset],
      )
    }

    score += local
    if (local >= 70) strong += 1
    samples += 1
  }

  if (!samples) return 0

  const continuity = strong / samples
  return score / samples * (0.55 + continuity * 0.9)
}

async function detectDocumentQuadFromImageEdges(
  image: File,
  prediction: unknown,
  targetAspectRatio: number,
): Promise<DocumentQuad | null> {
  const bitmap = await createImageBitmap(image)
  const originalWidth = bitmap.width
  const originalHeight = bitmap.height

  const seed = reviewCropFromPrediction(
    prediction,
    originalWidth,
    originalHeight,
    targetAspectRatio,
  )

  if (!seed) {
    bitmap.close()
    return null
  }

  const maxDimension = 720
  const scale = Math.min(
    1,
    maxDimension /
      Math.max(originalWidth, originalHeight),
  )

  const width = Math.max(
    1,
    Math.round(originalWidth * scale),
  )
  const height = Math.max(
    1,
    Math.round(originalHeight * scale),
  )

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext(
    '2d',
    { willReadFrequently: true },
  )

  if (!context) {
    bitmap.close()
    return null
  }

  context.drawImage(
    bitmap,
    0,
    0,
    width,
    height,
  )
  bitmap.close()

  const data = context.getImageData(
    0,
    0,
    width,
    height,
  ).data

  const gray = new Float32Array(width * height)

  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4
    gray[index] =
      data[offset] * 0.299 +
      data[offset + 1] * 0.587 +
      data[offset + 2] * 0.114
  }

  const gradient = new Float32Array(width * height)

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const topLeft = gray[(y - 1) * width + x - 1]
      const top = gray[(y - 1) * width + x]
      const topRight = gray[(y - 1) * width + x + 1]
      const left = gray[y * width + x - 1]
      const right = gray[y * width + x + 1]
      const bottomLeft = gray[(y + 1) * width + x - 1]
      const bottom = gray[(y + 1) * width + x]
      const bottomRight = gray[(y + 1) * width + x + 1]

      const gx =
        -topLeft + topRight -
        2 * left + 2 * right -
        bottomLeft + bottomRight

      const gy =
        -topLeft - 2 * top - topRight +
        bottomLeft + 2 * bottom + bottomRight

      gradient[y * width + x] =
        Math.min(
          255,
          Math.hypot(gx, gy) / 4,
        )
    }
  }

  const seedX = seed.x * scale
  const seedY = seed.y * scale
  const seedWidth = seed.width * scale
  const seedHeight = seed.height * scale

  const xStart = Math.max(
    0,
    seedX - seedWidth * 0.12,
  )
  const xEnd = Math.min(
    width - 1,
    seedX + seedWidth * 1.12,
  )
  const yStart = Math.max(
    0,
    seedY - seedHeight * 0.15,
  )
  const yEnd = Math.min(
    height - 1,
    seedY + seedHeight * 1.15,
  )

  const findHorizontal = (
    expectedY: number,
  ) => {
    let best:
      | {
          axis: 'horizontal'
          slope: number
          intercept: number
          score: number
        }
      | null = null

    const search = Math.max(
      10,
      seedHeight * 0.2,
    )

    for (
      let slope = -0.24;
      slope <= 0.2401;
      slope += 0.03
    ) {
      for (
        let anchorY = expectedY - search;
        anchorY <= expectedY + search;
        anchorY += 2
      ) {
        const intercept =
          anchorY -
          slope * (seedX + seedWidth / 2)

        const score =
          scoreHorizontalEdgeLine(
            gradient,
            width,
            height,
            xStart,
            xEnd,
            slope,
            intercept,
          )

        if (!best || score > best.score) {
          best = {
            axis: 'horizontal',
            slope,
            intercept,
            score,
          }
        }
      }
    }

    return best
  }

  const findVertical = (
    expectedX: number,
  ) => {
    let best:
      | {
          axis: 'vertical'
          slope: number
          intercept: number
          score: number
        }
      | null = null

    const search = Math.max(
      10,
      seedWidth * 0.16,
    )

    for (
      let slope = -0.24;
      slope <= 0.2401;
      slope += 0.03
    ) {
      for (
        let anchorX = expectedX - search;
        anchorX <= expectedX + search;
        anchorX += 2
      ) {
        const intercept =
          anchorX -
          slope * (seedY + seedHeight / 2)

        const score =
          scoreVerticalEdgeLine(
            gradient,
            width,
            height,
            yStart,
            yEnd,
            slope,
            intercept,
          )

        if (!best || score > best.score) {
          best = {
            axis: 'vertical',
            slope,
            intercept,
            score,
          }
        }
      }
    }

    return best
  }

  const top = findHorizontal(seedY)
  const bottom = findHorizontal(
    seedY + seedHeight,
  )
  const left = findVertical(seedX)
  const right = findVertical(
    seedX + seedWidth,
  )

  if (!top || !bottom || !left || !right) {
    return null
  }

  const minimumEdgeScore = 34
  if (
    Math.min(
      top.score,
      bottom.score,
      left.score,
      right.score,
    ) < minimumEdgeScore
  ) {
    return null
  }

  const tl = lineIntersection(top, left)
  const tr = lineIntersection(top, right)
  const br = lineIntersection(bottom, right)
  const bl = lineIntersection(bottom, left)

  if (!tl || !tr || !br || !bl) {
    return null
  }

  const quadScaled: DocumentQuad = {
    topLeft: tl,
    topRight: tr,
    bottomRight: br,
    bottomLeft: bl,
  }

  const area = polygonArea([
    tl,
    tr,
    br,
    bl,
  ])

  const seedArea =
    Math.max(1, seedWidth * seedHeight)

  if (
    area < seedArea * 0.68 ||
    area > seedArea * 1.62
  ) {
    return null
  }

  const avgWidth =
    (
      distanceBetween(tl, tr) +
      distanceBetween(bl, br)
    ) / 2
  const avgHeight =
    (
      distanceBetween(tl, bl) +
      distanceBetween(tr, br)
    ) / 2

  const ratio =
    avgWidth /
    Math.max(1, avgHeight)

  if (
    ratio <
      targetAspectRatio * 0.74 ||
    ratio >
      targetAspectRatio * 1.34
  ) {
    return null
  }

  const widthSkew =
    Math.max(
      distanceBetween(tl, tr),
      distanceBetween(bl, br),
    ) /
    Math.max(
      1,
      Math.min(
        distanceBetween(tl, tr),
        distanceBetween(bl, br),
      ),
    )

  const heightSkew =
    Math.max(
      distanceBetween(tl, bl),
      distanceBetween(tr, br),
    ) /
    Math.max(
      1,
      Math.min(
        distanceBetween(tl, bl),
        distanceBetween(tr, br),
      ),
    )

  if (
    widthSkew > 1.48 ||
    heightSkew > 1.48
  ) {
    return null
  }

  const inverseScale = 1 / scale

  return {
    topLeft: [
      quadScaled.topLeft[0] * inverseScale,
      quadScaled.topLeft[1] * inverseScale,
    ],
    topRight: [
      quadScaled.topRight[0] * inverseScale,
      quadScaled.topRight[1] * inverseScale,
    ],
    bottomRight: [
      quadScaled.bottomRight[0] * inverseScale,
      quadScaled.bottomRight[1] * inverseScale,
    ],
    bottomLeft: [
      quadScaled.bottomLeft[0] * inverseScale,
      quadScaled.bottomLeft[1] * inverseScale,
    ],
  }
}

function estimateDocumentQuad(
  prediction: unknown,
  imageWidth: number,
  imageHeight: number,
) {
  const points = predictionItems(prediction)
    .map(toGeometry)
    .filter(
      (item): item is PaddleItemGeometry =>
        item !== null &&
        item.points.length >= 4 &&
        item.height > 0,
    )
    .flatMap((item) => item.points)

  if (points.length < 12) {
    return null
  }

  const topLeft = [...points].sort(
    (a, b) =>
      a[0] + a[1] -
      (b[0] + b[1]),
  )[0]

  const topRight = [...points].sort(
    (a, b) =>
      (b[0] - b[1]) -
      (a[0] - a[1]),
  )[0]

  const bottomRight = [...points].sort(
    (a, b) =>
      b[0] + b[1] -
      (a[0] + a[1]),
  )[0]

  const bottomLeft = [...points].sort(
    (a, b) =>
      (a[0] - a[1]) -
      (b[0] - b[1]),
  )[0]

  const raw: DocumentQuad = {
    topLeft,
    topRight,
    bottomRight,
    bottomLeft,
  }

  const rawArea = polygonArea([
    raw.topLeft,
    raw.topRight,
    raw.bottomRight,
    raw.bottomLeft,
  ])

  if (
    rawArea <
    imageWidth * imageHeight * 0.008
  ) {
    return null
  }

  const center: [number, number] = [
    (
      topLeft[0] +
      topRight[0] +
      bottomRight[0] +
      bottomLeft[0]
    ) / 4,
    (
      topLeft[1] +
      topRight[1] +
      bottomRight[1] +
      bottomLeft[1]
    ) / 4,
  ]

  // OCR polygons describe the printed content, not the physical edge.
  // Expand them around their common centre so the final warp includes the
  // full card/page instead of only the text footprint.
  const expandX = 1.34
  const expandY = 1.72

  const expand = (
    point: [number, number],
  ): [number, number] => [
    Math.max(
      0,
      Math.min(
        imageWidth - 1,
        center[0] +
          (point[0] - center[0]) *
            expandX,
      ),
    ),
    Math.max(
      0,
      Math.min(
        imageHeight - 1,
        center[1] +
          (point[1] - center[1]) *
            expandY,
      ),
    ),
  ]

  const quad: DocumentQuad = {
    topLeft: expand(topLeft),
    topRight: expand(topRight),
    bottomRight: expand(bottomRight),
    bottomLeft: expand(bottomLeft),
  }

  const topWidth =
    distanceBetween(
      quad.topLeft,
      quad.topRight,
    )
  const bottomWidth =
    distanceBetween(
      quad.bottomLeft,
      quad.bottomRight,
    )
  const leftHeight =
    distanceBetween(
      quad.topLeft,
      quad.bottomLeft,
    )
  const rightHeight =
    distanceBetween(
      quad.topRight,
      quad.bottomRight,
    )

  if (
    Math.min(
      topWidth,
      bottomWidth,
      leftHeight,
      rightHeight,
    ) < 30
  ) {
    return null
  }

  return quad
}

function expandDocumentQuad(
  quad: DocumentQuad,
  imageWidth: number,
  imageHeight: number,
  factor = 1.035,
): DocumentQuad {
  const points = [
    quad.topLeft,
    quad.topRight,
    quad.bottomRight,
    quad.bottomLeft,
  ]

  const center: [number, number] = [
    points.reduce(
      (sum, point) => sum + point[0],
      0,
    ) / points.length,
    points.reduce(
      (sum, point) => sum + point[1],
      0,
    ) / points.length,
  ]

  const expand = (
    point: [number, number],
  ): [number, number] => [
    Math.max(
      0,
      Math.min(
        imageWidth - 1,
        center[0] +
          (point[0] - center[0]) * factor,
      ),
    ),
    Math.max(
      0,
      Math.min(
        imageHeight - 1,
        center[1] +
          (point[1] - center[1]) * factor,
      ),
    ),
  ]

  return {
    topLeft: expand(quad.topLeft),
    topRight: expand(quad.topRight),
    bottomRight: expand(quad.bottomRight),
    bottomLeft: expand(quad.bottomLeft),
  }
}

function perspectiveSeverity(
  quad: DocumentQuad,
) {
  const top =
    distanceBetween(
      quad.topLeft,
      quad.topRight,
    )
  const bottom =
    distanceBetween(
      quad.bottomLeft,
      quad.bottomRight,
    )
  const left =
    distanceBetween(
      quad.topLeft,
      quad.bottomLeft,
    )
  const right =
    distanceBetween(
      quad.topRight,
      quad.bottomRight,
    )

  const widthRatio =
    Math.max(top, bottom) /
    Math.max(1, Math.min(top, bottom))

  const heightRatio =
    Math.max(left, right) /
    Math.max(1, Math.min(left, right))

  return Math.max(
    widthRatio - 1,
    heightRatio - 1,
  )
}

function solveLinearSystem(
  matrix: number[][],
  vector: number[],
) {
  const size = vector.length
  const augmented = matrix.map(
    (row, index) => [
      ...row,
      vector[index],
    ],
  )

  for (let column = 0; column < size; column += 1) {
    let pivot = column

    for (
      let row = column + 1;
      row < size;
      row += 1
    ) {
      if (
        Math.abs(
          augmented[row][column],
        ) >
        Math.abs(
          augmented[pivot][column],
        )
      ) {
        pivot = row
      }
    }

    if (
      Math.abs(
        augmented[pivot][column],
      ) < 1e-9
    ) {
      return null
    }

    ;[
      augmented[column],
      augmented[pivot],
    ] = [
      augmented[pivot],
      augmented[column],
    ]

    const pivotValue =
      augmented[column][column]

    for (
      let index = column;
      index <= size;
      index += 1
    ) {
      augmented[column][index] /=
        pivotValue
    }

    for (
      let row = 0;
      row < size;
      row += 1
    ) {
      if (row === column) continue

      const factor =
        augmented[row][column]

      for (
        let index = column;
        index <= size;
        index += 1
      ) {
        augmented[row][index] -=
          factor *
          augmented[column][index]
      }
    }
  }

  return augmented.map(
    (row) => row[size],
  )
}

function homographyFromRectangleToQuad(
  width: number,
  height: number,
  quad: DocumentQuad,
) {
  const source = [
    quad.topLeft,
    quad.topRight,
    quad.bottomRight,
    quad.bottomLeft,
  ]

  const target: Array<[number, number]> = [
    [0, 0],
    [width - 1, 0],
    [width - 1, height - 1],
    [0, height - 1],
  ]

  const matrix: number[][] = []
  const vector: number[] = []

  for (let index = 0; index < 4; index += 1) {
    const [x, y] = target[index]
    const [u, v] = source[index]

    matrix.push([
      x,
      y,
      1,
      0,
      0,
      0,
      -u * x,
      -u * y,
    ])
    vector.push(u)

    matrix.push([
      0,
      0,
      0,
      x,
      y,
      1,
      -v * x,
      -v * y,
    ])
    vector.push(v)
  }

  const solved =
    solveLinearSystem(
      matrix,
      vector,
    )

  return solved
}

async function warpPerspectiveToDocument(
  image: File,
  quad: DocumentQuad,
  targetAspectRatio: number,
) {
  const bitmap =
    await createImageBitmap(image)

  const outputWidth = 1000
  const outputHeight = Math.max(
    1,
    Math.round(
      outputWidth / targetAspectRatio,
    ),
  )

  const homography =
    homographyFromRectangleToQuad(
      outputWidth,
      outputHeight,
      quad,
    )

  if (!homography) {
    bitmap.close()
    return null
  }

  const sourceCanvas =
    document.createElement('canvas')
  sourceCanvas.width = bitmap.width
  sourceCanvas.height = bitmap.height

  const sourceContext =
    sourceCanvas.getContext(
      '2d',
      { willReadFrequently: true },
    )

  if (!sourceContext) {
    bitmap.close()
    return null
  }

  sourceContext.drawImage(bitmap, 0, 0)
  bitmap.close()

  const source =
    sourceContext.getImageData(
      0,
      0,
      sourceCanvas.width,
      sourceCanvas.height,
    )

  const outputCanvas =
    document.createElement('canvas')
  outputCanvas.width = outputWidth
  outputCanvas.height = outputHeight

  const outputContext =
    outputCanvas.getContext('2d')

  if (!outputContext) return null

  const output =
    outputContext.createImageData(
      outputWidth,
      outputHeight,
    )

  const [
    h0,
    h1,
    h2,
    h3,
    h4,
    h5,
    h6,
    h7,
  ] = homography

  for (
    let y = 0;
    y < outputHeight;
    y += 1
  ) {
    for (
      let x = 0;
      x < outputWidth;
      x += 1
    ) {
      const denominator =
        h6 * x + h7 * y + 1

      if (
        Math.abs(denominator) < 1e-8
      ) {
        continue
      }

      const sourceX =
        (h0 * x + h1 * y + h2) /
        denominator
      const sourceY =
        (h3 * x + h4 * y + h5) /
        denominator

      const sx = Math.round(sourceX)
      const sy = Math.round(sourceY)

      if (
        sx < 0 ||
        sy < 0 ||
        sx >= source.width ||
        sy >= source.height
      ) {
        continue
      }

      const sourceIndex =
        (sy * source.width + sx) * 4
      const outputIndex =
        (y * outputWidth + x) * 4

      output.data[outputIndex] =
        source.data[sourceIndex]
      output.data[outputIndex + 1] =
        source.data[sourceIndex + 1]
      output.data[outputIndex + 2] =
        source.data[sourceIndex + 2]
      output.data[outputIndex + 3] =
        255
    }
  }

  outputContext.putImageData(
    output,
    0,
    0,
  )

  const blob = await new Promise<Blob>(
    (resolve, reject) => {
      outputCanvas.toBlob((value) => {
        if (value) resolve(value)
        else {
          reject(
            new Error(
              '無法產生透視校正證件圖。',
            ),
          )
        }
      }, 'image/png')
    },
  )

  return new File(
    [blob],
    'document-perspective-corrected.png',
    { type: 'image/png' },
  )
}

function clampReviewCrop(
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  imageWidth: number,
  imageHeight: number,
) {
  let cropWidth = Math.min(width, imageWidth)
  let cropHeight = Math.min(height, imageHeight)

  let x = centerX - cropWidth / 2
  let y = centerY - cropHeight / 2

  x = Math.max(
    0,
    Math.min(imageWidth - cropWidth, x),
  )
  y = Math.max(
    0,
    Math.min(imageHeight - cropHeight, y),
  )

  return {
    x,
    y,
    width: cropWidth,
    height: cropHeight,
  }
}

function reviewCropFromPrediction(
  prediction: unknown,
  imageWidth: number,
  imageHeight: number,
  targetAspectRatio: number,
) {
  const geometries = predictionItems(prediction)
    .map(toGeometry)
    .filter(
      (item): item is PaddleItemGeometry =>
        item !== null &&
        item.maxX - item.minX > 4 &&
        item.maxY - item.minY > 4,
    )

  if (geometries.length < 2) {
    return null
  }

  const minX = Math.min(
    ...geometries.map((item) => item.minX),
  )
  const maxX = Math.max(
    ...geometries.map((item) => item.maxX),
  )
  const minY = Math.min(
    ...geometries.map((item) => item.minY),
  )
  const maxY = Math.max(
    ...geometries.map((item) => item.maxY),
  )

  const textWidth = Math.max(1, maxX - minX)
  const textHeight = Math.max(1, maxY - minY)

  // Text rarely reaches the physical card/page edges. Add generous margins,
  // then normalize toward the expected document aspect ratio.
  let width = textWidth * 1.72
  let height = textHeight * 2.28

  if (width / height < targetAspectRatio) {
    width = height * targetAspectRatio
  } else {
    height = width / targetAspectRatio
  }

  // A crop that is still most of the original photo is not useful.
  // Keep it, but cap it enough to remove obviously irrelevant background.
  width = Math.min(width, imageWidth * 0.98)
  height = Math.min(height, imageHeight * 0.98)

  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  return clampReviewCrop(
    centerX,
    centerY,
    width,
    height,
    imageWidth,
    imageHeight,
  )
}

async function makeEdgeWhitePaddingTransparent(
  image: File,
) {
  const bitmap = await createImageBitmap(image)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height

  const context = canvas.getContext(
    '2d',
    { willReadFrequently: true },
  )

  if (!context) {
    bitmap.close()
    return image
  }

  context.drawImage(bitmap, 0, 0)
  bitmap.close()

  const frame = context.getImageData(
    0,
    0,
    canvas.width,
    canvas.height,
  )

  const { data } = frame
  const width = canvas.width
  const height = canvas.height
  const visited = new Uint8Array(width * height)
  const queue: number[] = []

  const isPaddingWhite = (index: number) => {
    const offset = index * 4

    return (
      data[offset] >= 248 &&
      data[offset + 1] >= 248 &&
      data[offset + 2] >= 248 &&
      data[offset + 3] >= 250
    )
  }

  const enqueue = (index: number) => {
    if (
      index < 0 ||
      index >= width * height ||
      visited[index] ||
      !isPaddingWhite(index)
    ) {
      return
    }

    visited[index] = 1
    queue.push(index)
  }

  for (let x = 0; x < width; x += 1) {
    enqueue(x)
    enqueue((height - 1) * width + x)
  }

  for (let y = 0; y < height; y += 1) {
    enqueue(y * width)
    enqueue(y * width + width - 1)
  }

  for (
    let cursor = 0;
    cursor < queue.length;
    cursor += 1
  ) {
    const index = queue[cursor]
    const x = index % width
    const y = Math.floor(index / width)

    const offset = index * 4
    data[offset + 3] = 0

    if (x > 0) enqueue(index - 1)
    if (x + 1 < width) enqueue(index + 1)
    if (y > 0) enqueue(index - width)
    if (y + 1 < height) enqueue(index + width)
  }

  context.putImageData(frame, 0, 0)

  const blob = await new Promise<Blob>(
    (resolve, reject) => {
      canvas.toBlob((value) => {
        if (value) resolve(value)
        else {
          reject(
            new Error(
              '無法產生覆核透明邊界圖片。',
            ),
          )
        }
      }, 'image/png')
    },
  )

  return new File(
    [blob],
    'document-review-clean.png',
    { type: 'image/png' },
  )
}

async function createStraightenedReviewImage(
  instance: PaddleInstance,
  image: File,
  targetAspectRatio: number,
  existingPrediction?: unknown,
) {
  const tryCandidate = async (
    candidate: File,
    predictionHint?: unknown,
  ) => {
    const prediction =
      predictionHint ??
      (await instance.predict(candidate))[0]

    const bitmap =
      await createImageBitmap(candidate)
    const imageWidth = bitmap.width
    const imageHeight = bitmap.height

    const crop = reviewCropFromPrediction(
      prediction,
      imageWidth,
      imageHeight,
      targetAspectRatio,
    )
    bitmap.close()

    const edgeQuad =
      await detectDocumentQuadFromImageEdges(
        candidate,
        prediction,
        targetAspectRatio,
      )

    if (
      edgeQuad &&
      perspectiveSeverity(edgeQuad) >= 0.055
    ) {
      const safeQuad =
        expandDocumentQuad(
          edgeQuad,
          imageWidth,
          imageHeight,
        )

      const corrected =
        await warpPerspectiveToDocument(
          candidate,
          safeQuad,
          targetAspectRatio,
        )

      if (corrected) {
        return await makeEdgeWhitePaddingTransparent(
          corrected,
        )
      }
    }

    // Never infer a perspective warp from OCR text bounds alone. At large
    // camera tilt it is safer to show a slightly wider crop with background
    // than to cut off part of the credential.
    if (!crop) return null

    const blob = await createPixelCrop(
      candidate,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      1100,
    )

    return await makeEdgeWhitePaddingTransparent(
      new File(
        [blob],
        'document-review.png',
        { type: 'image/png' },
      ),
    )
  }

  const full = await tryCandidate(
    image,
    existingPrediction,
  )
  if (full) return full

  // Distant photos can be too sparse for full-frame text detection.
  // Reuse the same centered enlargements used by OCR, then crop around
  // the text boxes inside that enlarged view.
  const crops =
    await createDistanceOcrCrops(image)

  for (const crop of crops) {
    const review =
      await tryCandidate(crop.file)

    if (review) return review
  }

  return image
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
      const rawTexts = Array.from(
        new Set(
          [
            ...vizItems
              .map(item =>
                typeof item.text === 'string'
                  ? item.text.trim()
                  : '',
              )
              .filter(Boolean),
            ...buildTextRows(vizItems),
          ].filter(Boolean),
        ),
      )
      const candidateTexts = Array.from(
        new Set(
          rawTexts
            .map(normalizeChineseNameCandidate)
            .filter(isPlausibleTaiwanChineseName),
        ),
      )

      const diagnostic: PassportChineseNameDiagnostic = {
        source: crop.source,
        rawTexts,
        candidateTexts,
      }
      best.chineseNameDiagnostics.push(diagnostic)

      const vizName = chooseTaiwanChineseName(
        vizItems,
        best.parsedMrz,
        (decisions, shadowName, officialName) => {
          diagnostic.decisionTrace = decisions
          diagnostic.shadowOneMismatchName = shadowName
          diagnostic.shadowOfficialName = officialName
        },
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

async function predictPassportWithDistanceFallback(
  instance: PaddleInstance,
  image: File,
  initializationMs: number,
  onFallback?: () => void,
) {
  const totalStartedAt = performance.now()

  let best = await predictOne(
    instance,
    image,
    initializationMs,
    onFallback,
  )

  let accumulatedPredictMs = best.predictMs

  const fullTooWeak =
    best.detectedItems === 0 ||
    (
      best.line2Validation?.requiredValid !== true &&
      !best.structureComplete &&
      (
        (best.recognizedCount ?? 0) < 5 ||
        (best.averageScore ?? 0) < 0.55
      )
    )

  if (fullTooWeak) {
    const crops =
      await createDistanceOcrCrops(image)

    for (const crop of crops) {
      onFallback?.()

      const candidate = await predictOne(
        instance,
        crop.file,
        0,
        onFallback,
      )

      accumulatedPredictMs +=
        candidate.predictMs

      candidate.distanceCropUsed = true
      candidate.distanceCropLabel =
        crop.label

      if (
        passportOrientationQuality(candidate) >
        passportOrientationQuality(best)
      ) {
        best = candidate
      }

      if (
        candidate.structureComplete &&
        candidate.line2Validation?.requiredValid === true
      ) {
        break
      }
    }
  }

  best.predictMs = accumulatedPredictMs
  best.totalMs =
    performance.now() - totalStartedAt

  return best
}

function passportOrientationQuality(
  result: PaddleBaselineResult,
) {
  return (
    (result.uprightSemanticScore ?? 0.5) * 2200 +
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
  const scanStartedAt = performance.now()
  const softBudgetMs = 9_000
  const withinBudget = () =>
    performance.now() - scanStartedAt < softBudgetMs

  const attempts: Array<{
    rotation: number
    image: File
    result: PaddleBaselineResult
  }> = []

  const runRotation = async (
    rotation: number,
    progress: number,
    fullRecovery = true,
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

    const result = fullRecovery
      ? await predictPassportWithDistanceFallback(
          instance,
          rotated,
          attempts.length === 0
            ? initializationMs
            : 0,
          () => {
            onProgress?.({
              stage: 'fallback',
              progress: Math.min(
                0.82,
                progress + 0.06,
              ),
              message:
                '正在加強辨識護照底部 MRZ…',
            })
          },
        )
      : await predictOne(
          instance,
          rotated,
          0,
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

  const isStrongPassport = (
    result: PaddleBaselineResult,
  ) =>
    result.structureComplete &&
    result.line1Valid &&
    result.line2Validation?.requiredValid === true &&
    (result.uprightSemanticScore ?? 0.5) >= 0.6

  const original = await runRotation(
    0,
    0.14,
    true,
  )

  if (
    !isStrongPassport(original) &&
    withinBudget()
  ) {
    const plus90 = await runRotation(
      90,
      0.32,
      false,
    )

    if (
      !isStrongPassport(plus90) &&
      withinBudget()
    ) {
      const minus90 = await runRotation(
        -90,
        0.5,
        false,
      )

      if (
        !isStrongPassport(minus90) &&
        withinBudget()
      ) {
        await runRotation(
          180,
          0.66,
          false,
        )
      }
    }
  }

  let best = [...attempts].sort(
    (a, b) =>
      passportOrientationQuality(b.result) -
      passportOrientationQuality(a.result),
  )[0]

  // Orientation probes deliberately skip the expensive distance-recovery
  // path. Once the best cardinal direction is known, permit one full
  // recovery pass only for that selected direction.
  if (
    best.rotation !== 0 &&
    !isStrongPassport(best.result) &&
    withinBudget()
  ) {
    const recovered =
      await predictPassportWithDistanceFallback(
        instance,
        best.image,
        0,
        () => {
          onProgress?.({
            stage: 'fallback',
            progress: 0.76,
            message:
              '方向已確認，正在對最佳方向加強辨識一次…',
          })
        },
      )

    recovered.rotationDegrees =
      best.rotation
    recovered.orientationAttempts =
      attempts.length
    recovered.orientedImage =
      best.image

    if (
      passportOrientationQuality(recovered) >=
      passportOrientationQuality(best.result)
    ) {
      best = {
        rotation: best.rotation,
        image: best.image,
        result: recovered,
      }
    }
  }

  const skew = best.result.detectedSkewDegrees ?? 0
  const reviewNeedsDeskew =
    Math.abs(skew) >= 2.5 &&
    Math.abs(skew) <= 40

  let reviewImage = best.image
  let reviewRotation = best.rotation

  if (reviewNeedsDeskew) {
    onProgress?.({
      stage: 'deskew',
      progress: 0.84,
      message:
        `偵測到約 ${Math.abs(skew).toFixed(1)}° 傾斜，正在產生轉正覆核圖…`,
    })

    reviewImage = await rotateImageFile(
      best.image,
      -skew,
    )
    reviewRotation =
      normalizeRotation(best.rotation - skew)

    const shouldRetryOcr =
      best.result.line2Validation?.requiredValid !== true ||
      !best.result.line1Valid ||
      (
        (
          best.result.parsedMrz?.nationality === 'TWN' ||
          best.result.parsedMrz?.issuingState === 'TWN'
        ) &&
        !best.result.chineseName
      )

    if (
      shouldRetryOcr &&
      withinBudget()
    ) {
      const deskewedResult =
        await predictPassportWithDistanceFallback(
          instance,
          reviewImage,
          0,
        )

      deskewedResult.rotationDegrees =
        reviewRotation
      deskewedResult.orientationAttempts =
        attempts.length + 1
      deskewedResult.orientedImage =
        reviewImage

      if (
        passportOrientationQuality(deskewedResult) >=
        passportOrientationQuality(best.result)
      ) {
        best = {
          rotation: reviewRotation,
          image: reviewImage,
          result: deskewedResult,
        }
      }
    }
  }

  if (
    !best.result.parsedMrz &&
    withinBudget()
  ) {
    onProgress?.({
      stage: 'fallback',
      progress: 0.91,
      message:
        'PaddleOCR 尚未取得完整 MRZ，正在使用第二套 MRZ 辨識重試…',
    })

    try {
      const tesseract =
        await recognizePassportWithTesseract(
          reviewImage,
          (progress) => {
            onProgress?.({
              stage: 'fallback',
              progress:
                0.91 +
                Math.max(
                  0,
                  Math.min(1, progress.progress),
                ) *
                  0.06,
              message:
                '正在加強辨識護照底部 MRZ…',
            })
          },
        )

      if (tesseract.parsedMrz) {
        best.result.mrzLine1 =
          tesseract.mrzLine1
        best.result.mrzLine2 =
          tesseract.mrzLine2
        best.result.line1Valid =
          isPlausibleTd3Line1(
            tesseract.mrzLine1,
          )
        best.result.line2Validation =
          tesseract.line2Validation
        best.result.mrzRepair =
          tesseract.mrzRepair
        best.result.parsedMrz =
          tesseract.parsedMrz
        best.result.structureComplete =
          Boolean(tesseract.mrzLine1) &&
          Boolean(tesseract.mrzLine2) &&
          tesseract.mrzLine2?.length === 44
        best.result.fallbackUsed = true
        best.result.fallbackCropRatio =
          tesseract.selectedCropRatio
      }
    } catch {
      // Keep the Paddle result and leave the item pending for human review.
      // A fallback failure must never discard the already-produced scan.
    }
  }

  best.result.orientationAttempts =
    Math.max(
      best.result.orientationAttempts ?? 1,
      attempts.length,
    )

  // When OCR is weak, text bounds are not trustworthy enough to crop the
  // passport page. Preserve the full oriented photo so human review never
  // loses the fields that OCR failed to detect. Only create a tightened,
  // straightened review image after a complete passport structure exists.
  best.result.rotationDegrees =
    reviewRotation

  best.result.orientedImage =
    reviewImage

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
  experimentalInstance?: ValidationPaddleInstance,
): Promise<PaddleBaselineResult> {
  const { instance, initializationMs } = experimentalInstance
    ? { instance: experimentalInstance, initializationMs: 0 }
    : await getPaddle()

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
  uprightSemanticScore: number
  distanceCropUsed: boolean
  distanceCropLabel: string | null
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
  let hasNearbyLatinName = false

  for (const item of geometries) {
    const chineseName =
      extractHanNameFromPermitText(item.text)

    if (!chineseName) continue

    for (const anchor of latinAnchors) {
      const scale = Math.max(
        1,
        item.height,
        anchor.item.height,
      )
      const vertical =
        Math.abs(item.centerY - anchor.item.centerY) / scale
      const horizontal =
        Math.abs(item.centerX - anchor.item.centerX) / scale

      // Only a *nearby* romanized name can block a labeled candidate.
      // A random Latin text elsewhere is not a reliable phonetic veto.
      if (vertical > 7 || horizontal > 20) continue
      hasNearbyLatinName = true

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
      ) continue

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

  return selectPermitNameCandidate(
    labelAnchored,
    phoneticCandidates,
    latinAnchors.length > 0,
    hasNearbyLatinName,
  )
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

  const validityPairAfterLabel =
    /(?:有效期限|有效期|PERIODOFVALIDITY|VALIDUNTIL|EXPIRY)[:：]?((?:19|20)\d{2}[./\-]\d{1,2}[./\-]\d{1,2})\s*[-~～至]\s*((?:19|20)\d{2}[./\-]\d{1,2}[./\-]\d{1,2})/i.exec(
      compact,
    )

  if (validityPairAfterLabel?.[2]) {
    return extractSinglePermitDate(
      validityPairAfterLabel[2],
    )
  }

  const dateAfterLabel =
    /(?:有效期限|有效期|PERIODOFVALIDITY|VALIDUNTIL|EXPIRY)[:：]?((?:19|20)\d{2}[./\-]\d{1,2}[./\-]\d{1,2})/i.exec(
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

function extractPermitChineseNameFromRows(
  rows: string[],
) {
  const latinRows = rows
    .map((row, index) => ({
      index,
      latin: extractPermitLatinName(row),
    }))
    .filter(
      (
        entry,
      ): entry is {
        index: number
        latin: PermitLatinName
      } => entry.latin !== null,
    )

  const labelIndexes = rows
    .map((row, index) => ({
      index,
      matches: permitLabelMatches(
        row,
        ['姓名', 'Name'],
      ),
    }))
    .filter(entry => entry.matches)
    .map(entry => entry.index)

  const candidates = rows.flatMap((row, index) => {
    const value = extractHanNameFromPermitText(row)
    if (!value) return []

    let compatibility: PermitRawNameCompatibility =
      latinRows.length ? 'conflict' : 'unknown'
    let latinDistance: number | null = null

    for (const entry of latinRows) {
      const current =
        compareChineseNameToMrzRomanization(
          value,
          entry.latin.surname,
          entry.latin.givenNames,
        )
      const distance = Math.abs(index - entry.index)

      if (current === 'compatible') {
        if (
          compatibility !== 'compatible' ||
          latinDistance === null ||
          distance < latinDistance
        ) {
          compatibility = 'compatible'
          latinDistance = distance
        }
        continue
      }

      if (
        current === 'unknown' &&
        compatibility !== 'compatible' &&
        (
          compatibility === 'conflict' ||
          latinDistance === null ||
          distance < latinDistance
        )
      ) {
        compatibility = 'unknown'
        latinDistance = distance
      }
    }

    const labelDistance = labelIndexes.length
      ? Math.min(
          ...labelIndexes.map(labelIndex =>
            Math.abs(index - labelIndex),
          ),
        )
      : null

    const compactRow = normalizePermitChineseName(row)

    return [{
      value,
      compatibility,
      latinDistance,
      labelDistance,
      exactRow: compactRow === value,
    }]
  })

  const selected =
    selectPermitRawNameCandidate(candidates)

  return selected
    ? {
        value: selected.value,
        compatibility: selected.compatibility,
      }
    : null
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

  const rowName =
    extractPermitChineseNameFromRows(rawRows)

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

  // A malformed GBK MRZ name must not shadow a valid visual name.
  const decodedMrzName = parsedMrz?.chineseName ?? ''
  const mrzChineseName =
    decodedMrzName &&
    isPlausiblePermitChineseName(decodedMrzName)
      ? decodedMrzName
      : ''

  const nameEvidence = selectPermitMrzVsVisualName(
    mrzChineseName,
    rowName?.value ?? '',
    rowName?.compatibility ?? 'unknown',
    name?.value ?? '',
    name?.score ?? null,
  )
  const finalChineseName = nameEvidence.value

  const finalPermitNumber =
    parsedMrz?.permitNumber ||
    permitNumber?.value ||
    ''

  const finalBirthDate =
    parsedMrz?.birthDate ||
    inferredBirth?.value ||
    ''

  const finalSex = selectPermitSexCandidate(
    parsedMrz?.sex ?? '',
    parsedMrz?.validation.requiredValid === true,
    sex?.value ?? '',
    sex?.score ?? null,
    semanticSex ?? '',
  )

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
      chineseName:
        rowName?.value
          ? null
          : name?.score ?? null,
      permitNumber: permitNumber?.score ?? null,
      birthDate: inferredBirth?.score ?? null,
      sex: sex?.score ?? null,
      expiryDate: expiryDate?.score ?? null,
    },
    rawRows,
    parsedMrz,
    mrzUsed: parsedMrz !== null,
    chineseNamePasses:
      mrzChineseName ||
      rowName?.value ||
      name?.value
        ? 1
        : 0,
    chineseNameConsensus:
      mrzChineseName ||
      rowName?.value ||
      name?.value
        ? 1
        : 0,
    chineseNameConfidence:
      nameEvidence.source === 'visual-agreement'
        ? Math.min(0.97, name?.score ?? 0.9)
        : nameEvidence.source === 'mrz'
          // The MRZ composite check does NOT cover the GBK name bytes.
          ? 0.86
          : rowName?.value
            ? (
                rowName.compatibility === 'compatible'
                  ? 0.92
                  : 0.82
              )
            : name?.score !== null && name?.score !== undefined
              ? Math.min(name.score, 0.85)
              : null,
    textHorizontalScore:
      estimateTextHorizontalScore(prediction),
    uprightSemanticScore:
      estimatePermitUprightScore(prediction),
    distanceCropUsed: false,
    distanceCropLabel: null,
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

function isPermitOrientationConfident(
  result: TaiwanCompatriotPermitOcrResult,
) {
  // Orientation confidence must depend on page geometry / semantic order,
  // not on whether every business field was successfully extracted.
  // Otherwise an upright card with a missed name/expiry field wastes time
  // retrying 90 / -90 / 180 degree full-page OCR.
  return (
    result.detectedItems >= 4 &&
    result.textHorizontalScore >= 0.72 &&
    result.uprightSemanticScore >= 0.67
  )
}

function permitResultQuality(
  result: TaiwanCompatriotPermitOcrResult,
) {
  return (
    result.uprightSemanticScore * 900 +
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

      return Math.abs(angle) <= 40
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
  let accumulatedPredictMs = 0

  const predict = async (candidate: File | Blob) => {
    const startedAt = performance.now()
    const [prediction] =
      await instance.predict(candidate)

    accumulatedPredictMs +=
      performance.now() - startedAt

    return prediction
  }

  const fullPrediction = await predict(image)

  let bestPrediction = fullPrediction
  let bestPredictionImage = image
  let best =
    buildTaiwanCompatriotPermitResult(
      fullPrediction,
      initializationMs,
      accumulatedPredictMs,
      performance.now() - totalStartedAt,
    )

  const fullTooWeak =
    best.detectedItems === 0 ||
    (
      best.parsedMrz?.validation.requiredValid !== true &&
      best.extractedFieldCount < 3
    )

  if (fullTooWeak) {
    const crops =
      await createDistanceOcrCrops(image)

    for (const crop of crops) {
      const cropPrediction =
        await predict(crop.file)

      const candidate =
        buildTaiwanCompatriotPermitResult(
          cropPrediction,
          initializationMs,
          accumulatedPredictMs,
          performance.now() - totalStartedAt,
        )

      candidate.distanceCropUsed = true
      candidate.distanceCropLabel =
        crop.label

      if (
        permitResultQuality(candidate) >
        permitResultQuality(best)
      ) {
        best = candidate
        bestPrediction = cropPrediction
        bestPredictionImage = crop.file
      }

      if (
        candidate.parsedMrz?.validation.requiredValid === true ||
        candidate.extractedFieldCount >= 4
      ) {
        break
      }
    }
  }

  best.predictMs = accumulatedPredictMs
  best.totalMs =
    performance.now() - totalStartedAt

  // OCR may use an enlarged crop; review still shows the full rotated photo.
  best.orientedImage = image

  return {
    prediction: bestPrediction,
    predictionImage: bestPredictionImage,
    result: best,
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

  const anchor = choosePermitNameCropAnchor(
    geometries,
    (text) => extractPermitLatinName(text) !== null,
  )

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
  canContinue: () => boolean = () => true,
  diagnostic?: (summary: PermitRetryDetectionSummary) => void,
) {
  const crops: Array<{
    file: File
    region: PermitNameRetryRegion
  }> = []

  const anchored = await createPermitNameGroupCrop(
    image,
    prediction,
  )

  if (anchored) {
    crops.push({ file: anchored, region: 'anchored' })
  }

  // Name retry requires legible Han glyphs. The generic relative crop
  // downscales broad regions, even when the source itself is low resolution.
  // Use bounded upscaling only for the *retry* crop, never for primary OCR.
  const broadBitmap = await createImageBitmap(image)
  const broadWidth = broadBitmap.width
  const broadHeight = broadBitmap.height
  broadBitmap.close()
  const broadBlob = await createPixelCrop(
    image,
    broadWidth * 0.08,
    broadHeight * 0.06,
    broadWidth * 0.84,
    broadHeight * 0.72,
    1500,
  )

  const broadCrop = new File(
    [broadBlob],
    'permit-name-broad.png',
    { type: 'image/png' },
  )
  crops.push({ file: broadCrop, region: 'broad' })

  const candidates: Array<{
    value: string
    score: number | null
    region: PermitNameRetryRegion
  }> = []
  const observations: Array<{ hasBoxes: boolean; hasCandidate: boolean }> = []
  let completedPasses = 0

  for (const crop of crops) {
    if (!canContinue()) break
    const [namePrediction] =
      await instance.predict(crop.file)
    completedPasses += 1

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

    observations.push({
      hasBoxes: geometries.length > 0,
      hasCandidate: candidate !== null,
    })
    if (candidate) {
      candidates.push({
        value: normalizePermitChineseName(candidate.value),
        score: candidate.score,
        region: crop.region,
      })
    }
  }

  diagnostic?.(summarizePermitRetryDetection(observations))
  return selectPermitRetryWinner(candidates, completedPasses)
}

export async function recognizeTaiwanCompatriotPermitWithPaddle(
  image: File,
  onProgress?: (
    progress: TaiwanCompatriotPermitOcrProgress,
  ) => void,
  experimentalInstance?: ValidationPaddleInstance,
  retryDiagnostic?: (summary: PermitRetryDetectionSummary) => void,
): Promise<TaiwanCompatriotPermitOcrResult> {
  const totalStartedAt = performance.now()
  const softBudgetMs = 9_000
  const withinBudget = () =>
    performance.now() - totalStartedAt < softBudgetMs
  onProgress?.({
    stage: 'initializing',
    progress: 0.05,
    message: '正在準備 PaddleOCR…',
  })

  const { instance, initializationMs } = experimentalInstance
    ? { instance: experimentalInstance, initializationMs: 0 }
    : await getPaddle()

  const attempts: Array<{
    rotation: number
    image: File
    prediction: unknown
    predictionImage: File
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
      predictionImage: predicted.predictionImage,
      result: predicted.result,
    })

    return predicted.result
  }

  const original = await tryRotation(0, 0.16)

  if (
    !isPermitOrientationConfident(original) &&
    withinBudget()
  ) {
    const plus90 = await tryRotation(
      90,
      0.34,
    )

    if (
      !isPermitOrientationConfident(plus90) &&
      withinBudget()
    ) {
      const minus90 = await tryRotation(
        -90,
        0.52,
      )

      if (
        !isPermitOrientationConfident(minus90) &&
        withinBudget()
      ) {
        const currentBest = [...attempts].sort(
          (a, b) =>
            permitResultQuality(b.result) -
            permitResultQuality(a.result),
        )[0]

        // 180° is only worth another full pass when the page orientation
        // itself is still uncertain. Missing business fields are handled by
        // targeted field retries after orientation has been selected.
        if (
          withinBudget() &&
          !isPermitOrientationConfident(
            currentBest.result,
          )
        ) {
          await tryRotation(180, 0.66)
        }
      }
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

  if (Math.abs(skew) >= 2.5 && Math.abs(skew) <= 40) {
    onProgress?.({
      stage: 'deskew',
      progress: 0.78,
      message:
        `偵測到約 ${Math.abs(skew).toFixed(1)}° 傾斜，正在產生轉正覆核圖…`,
    })

    const deskewImage = await rotateImageFile(
      best.image,
      -skew,
    )
    const deskewRotation =
      normalizeRotation(best.rotation - skew)

    if (withinBudget()) {
      const deskewPrediction = await predictPermit(
        instance,
        deskewImage,
        0,
        totalStartedAt,
      )

      deskewPrediction.result.rotationDegrees =
        deskewRotation
      deskewPrediction.result.orientationAttempts =
        attempts.length + 1

      if (
        permitResultQuality(deskewPrediction.result) >=
        permitResultQuality(best.result)
      ) {
        best = {
          rotation: deskewRotation,
          image: deskewImage,
          prediction: deskewPrediction.prediction,
          predictionImage: deskewPrediction.predictionImage,
          result: deskewPrediction.result,
        }
      }
    }
  }

  // The user-facing review image and rotation must match the OCR attempt
  // actually selected by permitResultQuality. A rejected deskew is never
  // presented as if it generated the retained recognition result.
  const reviewImage = best.image
  const reviewRotation = best.rotation

  // A nonempty but uncertain name can be wrong. Retry the name region
  // only under the existing time budget, and never override validated MRZ.
  // Existing check digits do not cover MRZ GBK name characters.
  // Only protect a corroborated name; otherwise a weak name may retry.
  const validatedMrzName =
    best.result.parsedMrz?.validation.requiredValid === true &&
    Boolean(best.result.parsedMrz?.chineseName) &&
    best.result.chineseNameConfidence !== null &&
    best.result.chineseNameConfidence >= 0.9
  if (
    shouldRetryUncertainPermitName(
      best.result.chineseName,
      best.result.chineseNameConfidence,
      validatedMrzName,
    ) &&
    withinBudget()
  ) {
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
      best.predictionImage,
      best.prediction,
      withinBudget,
      retryDiagnostic,
    )

    if (
      shouldUseRetriedPermitName(
        best.result.chineseName,
        best.result.chineseNameConfidence,
        retriedName ?? null,
      ) &&
      retriedName
    ) {
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
  best.result.rotationDegrees =
    reviewRotation
  best.result.orientedImage =
    withinBudget()
      ? await createStraightenedReviewImage(
          instance,
          reviewImage,
          1.586,
          reviewImage === best.image
            ? best.prediction
            : undefined,
        )
      : reviewImage

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



export type TaiwanNationalIdSex = 'M' | 'F' | ''

export interface TaiwanNationalIdOcrResult {
  initializationMs: number
  predictMs: number
  totalMs: number
  detectedItems: number
  averageScore: number | null
  chineseName: string
  nationalId: string
  birthDate: string
  sex: TaiwanNationalIdSex
  idChecksumValid: boolean
  extractedFieldCount: number
  fieldScores: {
    chineseName: number | null
    nationalId: number | null
    birthDate: number | null
  }
  rawRows: string[]
  rotationDegrees: number
  orientationAttempts: number
  orientedImage: File
  textHorizontalScore: number
  uprightSemanticScore: number
  distanceCropUsed: boolean
  distanceCropLabel: string | null
}

export interface TaiwanNationalIdOcrProgress {
  stage:
    | 'initializing'
    | 'orientation'
    | 'deskew'
    | 'name-retry'
    | 'completed'
  progress: number
  message: string
}

const taiwanIdAreaCodes: Record<string, number> = {
  A: 10, B: 11, C: 12, D: 13,
  E: 14, F: 15, G: 16, H: 17,
  I: 34, J: 18, K: 19, L: 20,
  M: 21, N: 22, O: 35, P: 23,
  Q: 24, R: 25, S: 26, T: 27,
  U: 28, V: 29, W: 32, X: 30,
  Y: 31, Z: 33,
}

export function validateTaiwanNationalId(
  value: string,
) {
  const id = value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')

  if (!/^[A-Z][12]\d{8}$/.test(id)) {
    return false
  }

  const area = taiwanIdAreaCodes[id[0]]
  if (area === undefined) return false

  let sum =
    Math.floor(area / 10) +
    (area % 10) * 9

  const weights = [8, 7, 6, 5, 4, 3, 2, 1]

  for (let index = 0; index < 8; index += 1) {
    sum += Number(id[index + 1]) * weights[index]
  }

  sum += Number(id[9])

  return sum % 10 === 0
}

function extractTaiwanNationalIdFromText(
  value: string,
) {
  const compact = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')

  const matches = compact.match(/[A-Z][12]\d{8}/g) ?? []

  const valid = matches.find(
    validateTaiwanNationalId,
  )

  return valid ?? matches[0] ?? null
}

const taiwanIdFixedChineseLabels = [
  '中華民國',
  '中华民国',
  '國民身分證',
  '国民身份证',
  '身分證',
  '身份证',
  '姓名',
  '出生日期',
  '出生',
  '統一編號',
  '统一编号',
  '身分證統一編號',
  '身分证统一编号',
  '發證日期',
  '发证日期',
  '發證地點',
  '发证地点',
  '性別',
  '性别',
  '性別男',
  '性別女',
  '性别男',
  '性别女',
  '父',
  '母',
  '配偶',
  '役別',
  '役别',
]

function extractTaiwanIdChineseName(
  value: string,
) {
  const normalized = value
    .replace(/\s+/g, '')
    .replace(/[，,。．.：:；;()（）\[\]【】]/g, '')

  const nameLabelMatch =
    normalized.match(/(?:姓名|NAME)/iu)

  if (nameLabelMatch?.index !== undefined) {
    let afterLabel = normalized.slice(
      nameLabelMatch.index +
        nameLabelMatch[0].length,
    )

    const stopLabels = [
      '中華民國',
      '中华民国',
      '國民身分證',
      '国民身份证',
      '身分證',
      '身份证',
      '出生日期',
      '出生年月日',
      '出生',
      '性別',
      '性别',
      '男',
      '女',
      '統一編號',
      '统一编号',
      '發證日期',
      '发证日期',
      '發證地點',
      '发证地点',
      '役別',
      '役别',
    ]

    let stopIndex = afterLabel.length

    for (const label of stopLabels) {
      const index = afterLabel.indexOf(label)

      if (
        index >= 0 &&
        index < stopIndex
      ) {
        stopIndex = index
      }
    }

    afterLabel = afterLabel.slice(
      0,
      stopIndex,
    )

    const labelledCandidate =
      afterLabel.match(
        /^[\p{Script=Han}·‧]{2,8}/u,
      )?.[0] ?? null

    if (labelledCandidate) {
      return labelledCandidate
    }
  }

  const cleaned = normalized
    .replace(/姓名/gu, '')
    .replace(/Name/giu, '')

  const candidates =
    cleaned.match(/[\p{Script=Han}·‧]{2,8}/gu) ?? []

  return (
    candidates
      .map((candidate) => candidate.trim())
      .find((candidate) => {
        if (
          taiwanIdFixedChineseLabels.some(
            (label) =>
              candidate === label ||
              candidate.includes(label) ||
              label.includes(candidate),
          )
        ) {
          return false
        }

        if (
          /^(?:性別|性别|男|女)/.test(
            candidate,
          )
        ) {
          return false
        }

        if (
          /(?:日期|地點|地点|地址|身分證|身份证|編號|编号)$/.test(
            candidate,
          )
        ) {
          return false
        }

        return true
      }) ?? null
  )
}

function chooseTaiwanIdChineseName(
  geometries: PaddleItemGeometry[],
  rows: string[],
) {
  // Paddle may return one complete row such as "姓名林奕辰" while the
  // geometry-based neighbour search sees only "奕辰". Prefer the explicit
  // labelled row because it preserves the surname and is semantically
  // stronger than proximity alone.
  for (let index = 0; index < rows.length; index += 1) {
    if (!/姓名|NAME/i.test(rows[index])) continue

    const sameRow =
      extractTaiwanIdChineseName(rows[index])

    if (sameRow) {
      return {
        value: sameRow,
        score: null,
        rank: 4,
      }
    }
  }

  const anchored = findLabelAnchoredCandidate(
    geometries,
    ['姓名', 'Name'],
    extractTaiwanIdChineseName,
  )

  if (anchored) return anchored

  for (let index = 0; index < rows.length; index += 1) {
    if (!/姓名|NAME/i.test(rows[index])) continue

    const nextRow =
      rows[index + 1]
        ? extractTaiwanIdChineseName(rows[index + 1])
        : null

    if (nextRow) {
      return {
        value: nextRow,
        score: null,
        rank: 1.5,
      }
    }
  }

  return null
}

function normalizeTaiwanIdDate(
  year: number,
  month: number,
  day: number,
) {
  const date = new Date(
    Date.UTC(year, month - 1, day),
  )

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

function extractTaiwanIdDatesFromText(
  value: string,
) {
  const dates: string[] = []

  const rocPattern =
    /(?:民國|民国)?\s*(\d{2,3})\s*[年./\-]\s*(\d{1,2})\s*[月./\-]\s*(\d{1,2})\s*日?/g

  for (const match of value.matchAll(rocPattern)) {
    const rocYear = Number(match[1])

    if (rocYear < 1 || rocYear > 300) continue

    const normalized = normalizeTaiwanIdDate(
      rocYear + 1911,
      Number(match[2]),
      Number(match[3]),
    )

    if (normalized) dates.push(normalized)
  }

  const adPattern =
    /(?:19|20)\d{2}\s*[./\-]\s*\d{1,2}\s*[./\-]\s*\d{1,2}/g

  for (const match of value.matchAll(adPattern)) {
    const parts = match[0]
      .split(/[./\-]/)
      .map((part) => Number(part.trim()))

    const normalized = normalizeTaiwanIdDate(
      parts[0],
      parts[1],
      parts[2],
    )

    if (normalized && !dates.includes(normalized)) {
      dates.push(normalized)
    }
  }

  return dates
}

function extractTaiwanIdBirthDateFromRows(
  rows: string[],
) {
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]

    if (!/出生日期|出生年月日|出生/.test(row)) {
      continue
    }

    const nearbyRows = [
      rows[index - 1],
      row,
      rows[index + 1],
    ].filter(
      (value): value is string =>
        typeof value === 'string',
    )

    const nearbyDates = [
      ...new Set(
        nearbyRows.flatMap(
          extractTaiwanIdDatesFromText,
        ),
      ),
    ].sort()

    if (nearbyDates.length) {
      // Taiwan ID OCR frequently merges "出生年月日" and "發證日期"
      // into one visual row. The birth date must be earlier than the
      // issuance date, so the earliest nearby valid date is the safe
      // semantic choice.
      return nearbyDates[0]
    }
  }

  const allDates = [
    ...new Set(
      rows.flatMap(extractTaiwanIdDatesFromText),
    ),
  ].sort()

  return allDates[0] ?? null
}

function sexFromTaiwanNationalId(
  nationalId: string,
): TaiwanNationalIdSex {
  if (!/^[A-Z][12]\d{8}$/.test(nationalId)) {
    return ''
  }

  return nationalId[1] === '1' ? 'M' : 'F'
}

function buildTaiwanNationalIdResult(
  prediction: unknown,
  initializationMs: number,
  predictMs: number,
  totalMs: number,
): TaiwanNationalIdOcrResult {
  const items = predictionItems(prediction)
  const geometries = items
    .map(toGeometry)
    .filter(
      (item): item is PaddleItemGeometry =>
        item !== null,
    )
  const rawRows = buildTextRows(items)

  const name =
    chooseTaiwanIdChineseName(
      geometries,
      rawRows,
    )

  const idCandidates = geometries
    .map((item) => {
      const value =
        extractTaiwanNationalIdFromText(
          item.text,
        )

      if (!value) return null

      return {
        value,
        score: item.score,
        valid: validateTaiwanNationalId(value),
      }
    })
    .filter(
      (
        item,
      ): item is {
        value: string
        score: number | null
        valid: boolean
      } => item !== null,
    )
    .sort((a, b) => {
      if (a.valid !== b.valid) {
        return a.valid ? -1 : 1
      }

      return (b.score ?? 0) - (a.score ?? 0)
    })

  let nationalId =
    idCandidates[0]?.value ?? ''

  if (!nationalId) {
    const fromRows =
      extractTaiwanNationalIdFromText(
        rawRows.join(' '),
      )

    nationalId = fromRows ?? ''
  }

  const idChecksumValid =
    Boolean(nationalId) &&
    validateTaiwanNationalId(nationalId)

  const birthDate =
    extractTaiwanIdBirthDateFromRows(rawRows) ?? ''

  const sex =
    idChecksumValid
      ? sexFromTaiwanNationalId(nationalId)
      : ''

  const scores = items
    .map((item) =>
      typeof item.score === 'number'
        ? item.score
        : null,
    )
    .filter(
      (score): score is number =>
        score !== null,
    )

  const averageScore = scores.length
    ? scores.reduce(
        (sum, score) => sum + score,
        0,
      ) / scores.length
    : null

  return {
    initializationMs,
    predictMs,
    totalMs,
    detectedItems: items.length,
    averageScore,
    chineseName: name?.value ?? '',
    nationalId,
    birthDate,
    sex,
    idChecksumValid,
    extractedFieldCount: [
      name?.value,
      nationalId,
      birthDate,
      sex,
    ].filter(Boolean).length,
    fieldScores: {
      chineseName: name?.score ?? null,
      nationalId: idCandidates[0]?.score ?? null,
      birthDate: null,
    },
    rawRows,
    rotationDegrees: 0,
    orientationAttempts: 1,
    orientedImage: new File(
      [],
      'placeholder.png',
      { type: 'image/png' },
    ),
    textHorizontalScore:
      estimateTextHorizontalScore(prediction),
    uprightSemanticScore:
      estimateTaiwanIdUprightScore(prediction),
    distanceCropUsed: false,
    distanceCropLabel: null,
  }
}

function taiwanIdResultQuality(
  result: TaiwanNationalIdOcrResult,
) {
  return (
    result.uprightSemanticScore * 1100 +
    result.textHorizontalScore * 420 +
    (result.idChecksumValid ? 1000 : 0) +
    (result.chineseName ? 16 : 0) +
    (result.birthDate ? 10 : 0) +
    (result.sex ? 6 : 0) +
    Math.min(result.detectedItems, 24) * 0.03 +
    (result.averageScore ?? 0)
  )
}

async function createCenteredOcrCrop(
  image: File,
  insetX: number,
  insetY: number,
  label: string,
) {
  const blob = await createRelativeCrop(
    image,
    insetX,
    insetY,
    1 - insetX * 2,
    1 - insetY * 2,
  )

  return {
    label,
    file: new File(
      [blob],
      `ocr-${label}.png`,
      { type: 'image/png' },
    ),
  }
}

async function createDistanceOcrCrops(
  image: File,
) {
  return [
    await createCenteredOcrCrop(
      image,
      0.08,
      0.1,
      'center-84',
    ),
    await createCenteredOcrCrop(
      image,
      0.14,
      0.18,
      'center-72',
    ),
  ]
}

async function predictTaiwanNationalId(
  instance: PaddleInstance,
  image: File,
  initializationMs: number,
  totalStartedAt: number,
) {
  let accumulatedPredictMs = 0

  const predict = async (candidate: File | Blob) => {
    const startedAt = performance.now()
    const [prediction] =
      await instance.predict(candidate)

    accumulatedPredictMs +=
      performance.now() - startedAt

    return prediction
  }

  const fullPrediction = await predict(image)

  let bestPrediction = fullPrediction
  let best = buildTaiwanNationalIdResult(
    fullPrediction,
    initializationMs,
    accumulatedPredictMs,
    performance.now() - totalStartedAt,
  )

  const fullTooWeak =
    best.detectedItems === 0 ||
    (
      !best.idChecksumValid &&
      !best.chineseName &&
      !best.birthDate
    )

  if (fullTooWeak) {
    const crops =
      await createDistanceOcrCrops(image)

    for (const crop of crops) {
      const cropPrediction =
        await predict(crop.file)

      const candidate =
        buildTaiwanNationalIdResult(
          cropPrediction,
          initializationMs,
          accumulatedPredictMs,
          performance.now() - totalStartedAt,
        )

      candidate.distanceCropUsed = true
      candidate.distanceCropLabel =
        crop.label

      if (
        taiwanIdResultQuality(candidate) >
        taiwanIdResultQuality(best)
      ) {
        best = candidate
        bestPrediction = cropPrediction
      }

      // A checksum-valid national ID is strong enough evidence that
      // the enlarged crop has found the document. Avoid another costly pass.
      if (candidate.idChecksumValid) {
        break
      }
    }
  }

  best.predictMs = accumulatedPredictMs
  best.totalMs =
    performance.now() - totalStartedAt

  // OCR may use an enlarged crop, but the human-review image must remain
  // the full rotated document photo.
  best.orientedImage = image

  return {
    prediction: bestPrediction,
    result: best,
  }
}

async function retryTaiwanIdName(
  instance: PaddleInstance,
  image: File,
) {
  const cropBlob = await createRelativeCrop(
    image,
    0.04,
    0.04,
    0.76,
    0.62,
  )

  const crop = new File(
    [cropBlob],
    'tw-id-name-region.png',
    { type: 'image/png' },
  )

  const [prediction] =
    await instance.predict(crop)

  const items = predictionItems(prediction)
  const geometries = items
    .map(toGeometry)
    .filter(
      (item): item is PaddleItemGeometry =>
        item !== null,
    )

  return chooseTaiwanIdChineseName(
    geometries,
    buildTextRows(items),
  )
}

export async function recognizeTaiwanNationalIdWithPaddle(
  image: File,
  onProgress?: (
    progress: TaiwanNationalIdOcrProgress,
  ) => void,
  experimentalInstance?: ValidationPaddleInstance,
): Promise<TaiwanNationalIdOcrResult> {
  const totalStartedAt = performance.now()
  const softBudgetMs = 9_000
  const withinBudget = () =>
    performance.now() - totalStartedAt < softBudgetMs

  onProgress?.({
    stage: 'initializing',
    progress: 0.05,
    message: '正在準備身分證 OCR…',
  })

  const { instance, initializationMs } = experimentalInstance
    ? { instance: experimentalInstance, initializationMs: 0 }
    : await getPaddle()

  const attempts: Array<{
    rotation: number
    image: File
    prediction: unknown
    result: TaiwanNationalIdOcrResult
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
          : `正在測試旋轉 ${rotation}° 的身分證…`,
    })

    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    )

    const rotated =
      await rotateImageFile(image, rotation)

    const predicted =
      await predictTaiwanNationalId(
        instance,
        rotated,
        attempts.length === 0
          ? initializationMs
          : 0,
        totalStartedAt,
      )

    predicted.result.rotationDegrees =
      rotation
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

  const original =
    await tryRotation(0, 0.16)

  const strongEnough =
    original.idChecksumValid &&
    Boolean(original.chineseName) &&
    Boolean(original.birthDate) &&
    original.textHorizontalScore >= 0.78 &&
    original.uprightSemanticScore >= 0.6

  const isStrongNationalId = (
    result: TaiwanNationalIdOcrResult,
  ) =>
    result.idChecksumValid &&
    Boolean(result.chineseName) &&
    Boolean(result.birthDate) &&
    result.textHorizontalScore >= 0.78 &&
    result.uprightSemanticScore >= 0.6

  if (
    !strongEnough &&
    withinBudget()
  ) {
    const plus90 = await tryRotation(
      90,
      0.34,
    )

    if (
      !isStrongNationalId(plus90) &&
      withinBudget()
    ) {
      const minus90 = await tryRotation(
        -90,
        0.52,
      )

      if (
        !isStrongNationalId(minus90) &&
        withinBudget()
      ) {
        await tryRotation(180, 0.66)
      }
    }
  }

  let best = [...attempts]
    .sort(
      (a, b) =>
        taiwanIdResultQuality(b.result) -
        taiwanIdResultQuality(a.result),
    )[0]

  const skew =
    estimateTextSkewDegrees(best.prediction)

  let reviewImage = best.image
  let reviewRotation = best.rotation

  if (
    Math.abs(skew) >= 2.5 &&
    Math.abs(skew) <= 40
  ) {
    onProgress?.({
      stage: 'deskew',
      progress: 0.8,
      message:
        `偵測到約 ${Math.abs(skew).toFixed(1)}° 傾斜，正在產生轉正覆核圖…`,
    })

    reviewImage =
      await rotateImageFile(
        best.image,
        -skew,
      )
    reviewRotation =
      normalizeRotation(
        best.rotation - skew,
      )

    if (withinBudget()) {
      const predicted =
        await predictTaiwanNationalId(
          instance,
          reviewImage,
          0,
          totalStartedAt,
        )

      predicted.result.rotationDegrees =
        reviewRotation
      predicted.result.orientationAttempts =
        attempts.length + 1

      if (
        taiwanIdResultQuality(predicted.result) >=
        taiwanIdResultQuality(best.result)
      ) {
        best = {
          rotation: reviewRotation,
          image: reviewImage,
          prediction: predicted.prediction,
          result: predicted.result,
        }
      }
    }
  }

  if (
    !best.result.chineseName &&
    withinBudget()
  ) {
    onProgress?.({
      stage: 'name-retry',
      progress: 0.92,
      message: '姓名尚未取得，正在放大姓名區域重試…',
    })

    const retry = await retryTaiwanIdName(
      instance,
      best.image,
    )

    if (retry) {
      best.result.chineseName = retry.value
      best.result.fieldScores.chineseName =
        retry.score
      best.result.extractedFieldCount = [
        best.result.chineseName,
        best.result.nationalId,
        best.result.birthDate,
        best.result.sex,
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

  // Keep the OCR fields from the strongest pass, but always show the
  // fully straightened full-size photo to the reviewer.
  best.result.rotationDegrees =
    reviewRotation
  best.result.orientedImage =
    withinBudget()
      ? await createStraightenedReviewImage(
          instance,
          reviewImage,
          1.586,
          reviewImage === best.image
            ? best.prediction
            : undefined,
        )
      : reviewImage

  onProgress?.({
    stage: 'completed',
    progress: 1,
    message:
      Math.abs(best.result.rotationDegrees) < 1
        ? '身分證辨識完成。'
        : `身分證辨識完成，已自動校正方向 ${best.result.rotationDegrees.toFixed(1)}°。`,
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

  const taiwanNationalId =
    extractTaiwanNationalIdFromText(
      rows.join(' '),
    )

  if (
    idText ||
    (
      taiwanNationalId &&
      validateTaiwanNationalId(
        taiwanNationalId,
      )
    )
  ) {
    if (idText) {
      evidence.push('偵測到身分證固定文字')
    }

    if (
      taiwanNationalId &&
      validateTaiwanNationalId(
        taiwanNationalId,
      )
    ) {
      evidence.push('偵測到通過檢查碼的國民身分證統一編號')
    }

    return {
      type: 'tw-id',
      confidence:
        idText && taiwanNationalId
          ? 'high'
          : 'medium',
      evidence,
    }
  }

  return {
    type: 'unknown',
    confidence: 'low',
    evidence: [],
  }
}

async function classifyDocumentImage(
  instance: PaddleInstance,
  image: File,
) {
  const [prediction] =
    await instance.predict(image)

  let result = classifyDocumentFromItems(
    predictionItems(prediction),
  )

  if (result.type !== 'unknown') {
    return result
  }

  const crops =
    await createDistanceOcrCrops(image)

  for (const crop of crops) {
    const [cropPrediction] =
      await instance.predict(crop.file)

    result = classifyDocumentFromItems(
      predictionItems(cropPrediction),
    )

    if (result.type !== 'unknown') {
      return {
        ...result,
        evidence: [
          ...result.evidence,
          '遠距照片已自動放大證件區域',
        ],
      }
    }
  }

  return result
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

    const result =
      await classifyDocumentImage(
        instance,
        candidate,
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
