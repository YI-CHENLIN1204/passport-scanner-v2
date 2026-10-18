<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  addScanItem,
  completeScanBatch,
  createScanBatch,
  getTourDetail,
  listTours,
  type CreateScanItemRequest,
  type TourDetailResponse,
  type TourSummaryResponse,
} from '../services/api'
import {
  convertSimplifiedNameToTraditional,
} from '../services/nameScriptConversion'
import {
  detectDocumentTypeWithPaddle,
  recognizePassportWithPaddle,
  recognizeTaiwanCompatriotPermitWithPaddle,
  recognizeTaiwanNationalIdWithPaddle,
  validateTaiwanNationalId,
  warmupPaddleOcr,
  type DetectedDocumentType,
} from '../services/paddleOcr'
import {
  disposePassportV6ReviewRecognizer,
  suggestPassportV6NameForReview,
} from '../services/passportV6ChineseNameReviewCandidate'

const props = defineProps<{
  tourId?: string | null
}>()

const emit = defineEmits<{
  navigate: [path: string]
  runningChange: [running: boolean]
}>()

interface BatchFileState {
  file: File
  status: 'queued' | 'processing' | 'done' | 'error'
  message: string
  elapsedMs: number | null
  detailRetry: 'none' | 'attempted' | 'accepted'
}

const tours = ref<TourSummaryResponse[]>([])
const selectedTourId = ref(props.tourId ?? '')
const detail = ref<TourDetailResponse | null>(null)
const documentType = ref('')
const files = ref<BatchFileState[]>([])
const loading = ref(true)
const running = ref(false)
const error = ref('')
const progressMessage = ref('')
const completedCount = ref(0)
const dragActive = ref(false)

const selectedTour = computed(() =>
  tours.value.find(
    tour => tour.tourId === selectedTourId.value,
  ) ?? null,
)

const availableDocumentTypes = computed(() =>
  detail.value?.tour.requiredDocumentTypes ?? [],
)

const progressPercent = computed(() => {
  if (!files.value.length) return 0

  return Math.round(
    (completedCount.value / files.value.length) * 100,
  )
})

const successCount = computed(() =>
  files.value.filter(item => item.status === 'done').length,
)

const failedCount = computed(() =>
  files.value.filter(item => item.status === 'error').length,
)

const runnableCount = computed(() =>
  files.value.filter(
    item => item.status !== 'done',
  ).length,
)

const batchFinished = computed(
  () =>
    files.value.length > 0 &&
    !running.value &&
    completedCount.value === files.value.length,
)

const averageCompletedMs = computed(() => {
  const completed = files.value
    .map(item => item.elapsedMs)
    .filter(
      (value): value is number =>
        typeof value === 'number',
    )

  if (!completed.length) return null

  return (
    completed.reduce(
      (sum, value) => sum + value,
      0,
    ) / completed.length
  )
})

function documentLabel(type: string) {
  if (type === 'PASSPORT') return '護照'
  if (type === 'TAIWAN_COMPATRIOT_PERMIT') return '台胞證'
  if (type === 'TAIWAN_NATIONAL_ID') return '身分證'
  return type
}

function detectedDocumentLabel(type: DetectedDocumentType) {
  if (type === 'passport') return '護照'
  if (type === 'taiwan-compatriot-permit') return '台胞證'
  if (type === 'tw-id') return '台灣身分證'
  return '無法確認'
}

function expectedDetectedType(): DetectedDocumentType {
  if (documentType.value === 'PASSPORT') {
    return 'passport'
  }

  if (
    documentType.value ===
    'TAIWAN_COMPATRIOT_PERMIT'
  ) {
    return 'taiwan-compatriot-permit'
  }

  if (documentType.value === 'TAIWAN_NATIONAL_ID') {
    return 'tw-id'
  }

  return 'unknown'
}

function formatIsoDate(
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

function mrzBirthDateToIso(value: string) {
  if (!/^\d{6}$/.test(value)) return null

  const yy = Number(value.slice(0, 2))
  const month = Number(value.slice(2, 4))
  const day = Number(value.slice(4, 6))
  const currentYear = new Date().getUTCFullYear()
  const currentTwoDigits = currentYear % 100
  const year =
    yy <= currentTwoDigits
      ? 2000 + yy
      : 1900 + yy

  return formatIsoDate(year, month, day)
}

function passportNationalIdFromMrz(
  personalNumber: string,
  issuingState: string,
  nationality: string,
) {
  if (
    issuingState !== 'TWN' &&
    nationality !== 'TWN'
  ) {
    return null
  }

  const candidate = personalNumber
    .replace(/</g, '')
    .trim()
    .toUpperCase()

  return validateTaiwanNationalId(candidate)
    ? candidate
    : null
}

function mrzExpiryDateToIso(value: string) {
  if (!/^\d{6}$/.test(value)) return null

  const yy = Number(value.slice(0, 2))
  const month = Number(value.slice(2, 4))
  const day = Number(value.slice(4, 6))
  const currentYear = new Date().getUTCFullYear()
  const currentCentury =
    Math.floor(currentYear / 100) * 100
  let year = currentCentury + yy

  if (year < currentYear - 20) {
    year += 100
  }

  return formatIsoDate(year, month, day)
}

interface PreparedOcrInput {
  file: File
  resized: boolean
  originalWidth: number
  originalHeight: number
  workingWidth: number
  workingHeight: number
}

async function prepareOcrInput(
  file: File,
): Promise<PreparedOcrInput> {
  const bitmap = await createImageBitmap(file)
  const originalWidth = bitmap.width
  const originalHeight = bitmap.height
  const longestSide = Math.max(
    originalWidth,
    originalHeight,
  )
  const pixels =
    originalWidth * originalHeight

  // Large phone photos cost much more to process while the document text
  // remains easily readable at roughly 2.4K on the longest side. Keep small
  // images untouched so we do not throw away useful detail.
  const maxSide = 2400
  const maxPixels = 4_500_000
  const sideScale =
    maxSide / Math.max(1, longestSide)
  const pixelScale = Math.sqrt(
    maxPixels / Math.max(1, pixels),
  )
  const scale = Math.min(
    1,
    sideScale,
    pixelScale,
  )

  if (scale >= 0.98) {
    bitmap.close()

    return {
      file,
      resized: false,
      originalWidth,
      originalHeight,
      workingWidth: originalWidth,
      workingHeight: originalHeight,
    }
  }

  const workingWidth = Math.max(
    1,
    Math.round(originalWidth * scale),
  )
  const workingHeight = Math.max(
    1,
    Math.round(originalHeight * scale),
  )

  const canvas =
    document.createElement('canvas')
  canvas.width = workingWidth
  canvas.height = workingHeight

  const context = canvas.getContext('2d')

  if (!context) {
    bitmap.close()
    throw new Error(
      '無法建立 OCR 工作圖片。',
    )
  }

  context.fillStyle = '#ffffff'
  context.fillRect(
    0,
    0,
    workingWidth,
    workingHeight,
  )
  context.drawImage(
    bitmap,
    0,
    0,
    workingWidth,
    workingHeight,
  )
  bitmap.close()

  const blob = await new Promise<Blob>(
    (resolve, reject) => {
      canvas.toBlob(
        value => {
          if (value) {
            resolve(value)
          } else {
            reject(
              new Error(
                '無法建立 OCR 工作圖片。',
              ),
            )
          }
        },
        'image/jpeg',
        0.92,
      )
    },
  )

  const baseName = file.name.replace(
    /\.[^.]+$/,
    '',
  )

  return {
    file: new File(
      [blob],
      `${baseName}-ocr.jpg`,
      { type: 'image/jpeg' },
    ),
    resized: true,
    originalWidth,
    originalHeight,
    workingWidth,
    workingHeight,
  }
}

async function prepareReviewImage(file: File) {
  const bitmap = await createImageBitmap(file)
  const maxSide = 3200
  const longestSide = Math.max(
    bitmap.width,
    bitmap.height,
  )

  if (
    /^image\/jpe?g$/i.test(file.type) &&
    file.size <= 5 * 1024 * 1024 &&
    longestSide <= maxSide
  ) {
    bitmap.close()
    return file
  }

  const scale = Math.min(
    1,
    maxSide / Math.max(1, longestSide),
  )
  const width = Math.max(
    1,
    Math.round(bitmap.width * scale),
  )
  const height = Math.max(
    1,
    Math.round(bitmap.height * scale),
  )

  const canvas =
    document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')

  if (!context) {
    bitmap.close()
    throw new Error(
      '無法建立人工覆核圖片。',
    )
  }

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(
    bitmap,
    0,
    0,
    width,
    height,
  )
  bitmap.close()

  const blob = await new Promise<Blob>(
    (resolve, reject) => {
      canvas.toBlob(
        value => {
          if (value) {
            resolve(value)
          } else {
            reject(
              new Error(
                '無法壓縮人工覆核圖片。',
              ),
            )
          }
        },
        'image/jpeg',
        0.9,
      )
    },
  )

  const baseName = file.name.replace(
    /\.[^.]+$/,
    '',
  )

  return new File(
    [blob],
    `${baseName}-review.jpg`,
    { type: 'image/jpeg' },
  )
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      const value =
        typeof reader.result === 'string'
          ? reader.result
          : ''
      const comma = value.indexOf(',')

      if (comma < 0) {
        reject(new Error('圖片轉換失敗。'))
        return
      }

      resolve(value.slice(comma + 1))
    }

    reader.onerror = () =>
      reject(new Error('圖片讀取失敗。'))

    reader.readAsDataURL(file)
  })
}

async function loadTour(tourId: string) {
  detail.value = null
  documentType.value = ''
  resetFiles()

  if (!tourId) return

  const loaded = await getTourDetail(tourId)
  detail.value = loaded

  if (loaded?.tour.requiredDocumentTypes.length) {
    documentType.value =
      loaded.tour.requiredDocumentTypes[0]
  }
}

async function load() {
  loading.value = true
  error.value = ''

  try {
    tours.value = await listTours('')

    if (
      selectedTourId.value &&
      !tours.value.some(
        tour => tour.tourId === selectedTourId.value,
      )
    ) {
      selectedTourId.value = ''
    }

    if (selectedTourId.value) {
      await loadTour(selectedTourId.value)
    }
  } catch (err) {
    error.value =
      err instanceof Error
        ? err.message
        : '掃描工作區載入失敗。'
  } finally {
    loading.value = false
  }
}

function fileKey(file: File) {
  return [
    file.name,
    file.size,
    file.lastModified,
  ].join(':')
}

function addFiles(chosen: File[]) {
  error.value = ''
  progressMessage.value = ''

  const valid = chosen.filter(
    file =>
      file.type.startsWith('image/') &&
      file.size <= 15 * 1024 * 1024,
  )

  if (valid.length !== chosen.length) {
    error.value =
      '已忽略非圖片或超過 15 MB 的檔案。'
  }

  const existing = new Set(
    files.value.map(item => fileKey(item.file)),
  )

  for (const file of valid) {
    const key = fileKey(file)

    if (existing.has(key)) continue

    files.value.push({
      file,
      status: 'queued',
      message: '等待辨識',
      elapsedMs: null,
      detailRetry: 'none',
    })

    existing.add(key)
  }

  completedCount.value =
    files.value.filter(
      item =>
        item.status === 'done' ||
        item.status === 'error',
    ).length
}

function chooseFiles(event: Event) {
  const input = event.target as HTMLInputElement
  addFiles(Array.from(input.files ?? []))
  input.value = ''
}

function onDrop(event: DragEvent) {
  dragActive.value = false

  if (running.value || !documentType.value) return

  addFiles(Array.from(event.dataTransfer?.files ?? []))
}

function removeFile(index: number) {
  if (running.value) return

  files.value.splice(index, 1)
  completedCount.value =
    files.value.filter(
      item =>
        item.status === 'done' ||
        item.status === 'error',
    ).length
  progressMessage.value = ''
}

function resetFiles() {
  if (running.value) return

  files.value = []
  completedCount.value = 0
  progressMessage.value = ''
  dragActive.value = false
}

async function verifyDocumentTypeOnlyWhenNeeded(
  file: File,
  strongExpectedEvidence: boolean,
) {
  if (strongExpectedEvidence) {
    return
  }

  progressMessage.value =
    `辨識結果較弱，正在額外確認「${file.name}」的證件類型…`

  const detection =
    await detectDocumentTypeWithPaddle(file)

  const expected = expectedDetectedType()

  // Unknown means the classifier also cannot be certain. Keep the item for
  // human review instead of discarding a potentially valid low-quality scan.
  if (detection.type === 'unknown') {
    return
  }

  if (detection.type !== expected) {
    throw new Error(
      `證件類型不符：本批設定為${documentLabel(documentType.value)}，這張辨識為${detectedDocumentLabel(detection.type)}。`,
    )
  }
}

async function buildPassportItem(
  sourceFile: File,
  prepared: PreparedOcrInput,
): Promise<CreateScanItemRequest> {
  const file = prepared.file
  let result = await recognizePassportWithPaddle(
    file,
    progress => {
      progressMessage.value = progress.message
    },
  )

  // Missing-name only, source-detail recovery. Never rerun successful scans.
  // High-resolution recovery does not relax the production name selector.
  // Require the original MRZ document number to stay identical before using
  // any second-pass field; no cross-document or heuristic name overwrite.
  let detailRetryAttempted = false
  let detailRetryAccepted = false
  if (
    prepared.resized &&
    !result.chineseName?.trim() &&
    result.parsedMrz?.documentNumber &&
    prepared.originalWidth * prepared.originalHeight <= 12_000_000 &&
    Math.max(prepared.originalWidth, prepared.originalHeight) <= 4200
  ) {
    detailRetryAttempted = true
    try {
      progressMessage.value = '中文姓名缺失，嘗試原圖細節補救'
      const extra = await recognizePassportWithPaddle(
        sourceFile,
        progress => { progressMessage.value = progress.message },
      )
      if (
        extra.chineseName?.trim() &&
        extra.parsedMrz?.documentNumber === result.parsedMrz.documentNumber &&
        extra.parsedMrz?.birthDate === result.parsedMrz.birthDate &&
        extra.parsedMrz?.surname === result.parsedMrz.surname &&
        extra.parsedMrz?.givenNames === result.parsedMrz.givenNames
        && extra.parsedMrz?.sex === result.parsedMrz.sex
        && extra.parsedMrz?.nationality === result.parsedMrz.nationality
        && extra.parsedMrz?.issuingState === result.parsedMrz.issuingState
        && extra.parsedMrz?.expiryDate === result.parsedMrz.expiryDate
      ) {
        // Keep all fields internally consistent by using the full result.
        result = extra
        detailRetryAccepted = true
      }
    } catch {
      // Optional recovery failure never discards the primary result.
    }
  }

  const secondaryChineseNameReview: {
    attempted: boolean
    status:
      | 'not-needed'
      | 'suggested'
      | 'no-compatible-candidate'
      | 'ambiguous-compatible-candidates'
      | 'unavailable'
    candidate: string | null
    model: string | null
    candidateCount: number
    compatibleCandidateCount: number
    ambiguousScriptCount: number
    scriptConvertedCount: number
    candidateSource: 'broad-viz' | 'lower-page' | null
  } = {
    attempted: false,
    status: 'not-needed',
    candidate: null,
    model: null,
    candidateCount: 0,
    compatibleCandidateCount: 0,
    ambiguousScriptCount: 0,
    scriptConvertedCount: 0,
    candidateSource: null,
  }

  // D-103: the second recognizer is review-only. It runs only when the
  // production result is not already strictly MRZ-compatible, and it never
  // mutates result.chineseName / request.nameZh automatically.
  const candidateMrz = result.parsedMrz
  if (
    result.chineseNameRomanizationStatus !== 'compatible' &&
    candidateMrz?.surname &&
    candidateMrz.givenNames
  ) {
    secondaryChineseNameReview.attempted = true
    progressMessage.value =
      '主模型中文姓名不可信，正在產生第二模型人工覆核候選'

    try {
      const secondaryInput =
        prepared.originalWidth * prepared.originalHeight <= 12_000_000 &&
        Math.max(prepared.originalWidth, prepared.originalHeight) <= 4200
          ? sourceFile
          : file
      const suggestion =
        await suggestPassportV6NameForReview(
          secondaryInput,
          candidateMrz.surname,
          candidateMrz.givenNames,
        )

      secondaryChineseNameReview.status = suggestion.status
      secondaryChineseNameReview.candidate = suggestion.candidate
      secondaryChineseNameReview.model = suggestion.model
      secondaryChineseNameReview.candidateCount = suggestion.candidateCount
      secondaryChineseNameReview.compatibleCandidateCount =
        suggestion.compatibleCandidateCount
      secondaryChineseNameReview.ambiguousScriptCount =
        suggestion.ambiguousScriptCount
      secondaryChineseNameReview.scriptConvertedCount =
        suggestion.scriptConvertedCount
      secondaryChineseNameReview.candidateSource =
        suggestion.candidateSource
    } catch {
      // Optional local model failure must never block the normal review queue.
      secondaryChineseNameReview.status = 'unavailable'
      secondaryChineseNameReview.model =
        'PP-OCRv6_small_rec'
    }
  }

  // Display Taiwanese passport names in Traditional Chinese, keeping the
  // literal OCR text separately for traceability and review.
  const rawPassportChineseName = result.chineseName ?? ''
  const passportNameScript = convertSimplifiedNameToTraditional(
    rawPassportChineseName.replaceAll('温', '溫'),
  )
  const normalizedPassportChineseName = passportNameScript.value

  const parsed = result.parsedMrz
  const actualOcrFile = detailRetryAccepted ? sourceFile : file
  const nationalIdNumber = parsed
    ? passportNationalIdFromMrz(
        parsed.personalNumber,
        parsed.issuingState,
        parsed.nationality,
      )
    : null

  await verifyDocumentTypeOnlyWhenNeeded(
    actualOcrFile,
    Boolean(parsed) || result.structureComplete,
  )

  const orientedImage =
    result.orientedImage ?? actualOcrFile
  const reviewImage =
    await prepareReviewImage(orientedImage)
  const imageBase64 =
    await fileToBase64(reviewImage)
  const ocrInputImageBase64 =
    await fileToBase64(actualOcrFile)

  return {
    originalFileName: sourceFile.name,
    imageContentType:
      reviewImage.type ||
      file.type ||
      'image/jpeg',
    imageBase64,
    ocrInputImageContentType:
      actualOcrFile.type || 'image/jpeg',
    ocrInputImageBase64,
    nameZh: normalizedPassportChineseName,
    nameZhOnDocument: rawPassportChineseName,
    nameEn: parsed
      ? [parsed.surname, parsed.givenNames]
          .filter(Boolean)
          .join(', ')
      : '',
    birthDate: parsed
      ? mrzBirthDateToIso(parsed.birthDate)
      : null,
    gender: parsed?.sex ?? '',
    nationality: parsed?.nationality ?? null,
    nationalIdNumber,
    documentNumber: parsed?.documentNumber ?? '',
    issuingCountry: parsed?.issuingState ?? null,
    expiryDate: parsed
      ? mrzExpiryDateToIso(parsed.expiryDate)
      : null,
    ocrPayloadJson: JSON.stringify({
      engine: 'PaddleOCR',
      structureComplete: result.structureComplete,
      line1Valid: result.line1Valid,
      rotationDegrees: result.rotationDegrees ?? 0,
      orientationAttempts:
        result.orientationAttempts ?? 1,
      detectedItems: result.detectedItems,
      averageScore: result.averageScore,
      initializationMs: result.initializationMs,
      predictMs: result.predictMs,
      totalMs: result.totalMs,
      fallbackUsed: result.fallbackUsed,
      sourceDetailRetry: {
        attempted: detailRetryAttempted,
        accepted: detailRetryAccepted,
      },
      secondaryChineseNameReview,
      passportNameScript: {
        normalized: normalizedPassportChineseName !== rawPassportChineseName,
        ambiguousCharacters: passportNameScript.ambiguousCharacters,
      },
      ocrInput: {
        resized: detailRetryAccepted ? false : prepared.resized,
        originalWidth:
          prepared.originalWidth,
        originalHeight:
          prepared.originalHeight,
        workingWidth:
          detailRetryAccepted ? prepared.originalWidth : prepared.workingWidth,
        workingHeight:
          detailRetryAccepted ? prepared.originalHeight : prepared.workingHeight,
      },
      originalFields: {
        nameZh: result.chineseName ?? '',
        nameEn: parsed
          ? [parsed.surname, parsed.givenNames]
              .filter(Boolean)
              .join(', ')
          : '',
        birthDate: parsed
          ? mrzBirthDateToIso(parsed.birthDate)
          : null,
        gender: parsed?.sex ?? '',
        nationality:
          parsed?.nationality ?? null,
        nationalIdNumber,
        documentNumber:
          parsed?.documentNumber ?? '',
        issuingCountry:
          parsed?.issuingState ?? null,
        expiryDate: parsed
          ? mrzExpiryDateToIso(
              parsed.expiryDate,
            )
          : null,
      },
    }),
  }
}

async function buildPermitItem(
  sourceFile: File,
  prepared: PreparedOcrInput,
): Promise<CreateScanItemRequest> {
  const file = prepared.file
  const result =
    await recognizeTaiwanCompatriotPermitWithPaddle(
      file,
      progress => {
        progressMessage.value = progress.message
      },
    )

  await verifyDocumentTypeOnlyWhenNeeded(
    file,
    Boolean(result.parsedMrz) ||
      Boolean(
        result.permitNumber &&
          result.birthDate &&
          result.sex,
      ),
  )

  const orientedImage =
    result.orientedImage ?? file
  const reviewImage =
    await prepareReviewImage(orientedImage)
  const imageBase64 =
    await fileToBase64(reviewImage)
  const ocrInputImageBase64 =
    await fileToBase64(file)

  const printedChineseName =
    result.chineseName ?? ''
  const traditionalChineseName =
    convertSimplifiedNameToTraditional(
      printedChineseName,
    ).value

  return {
    originalFileName: sourceFile.name,
    imageContentType:
      reviewImage.type ||
      file.type ||
      'image/jpeg',
    imageBase64,
    ocrInputImageContentType:
      file.type || 'image/jpeg',
    ocrInputImageBase64,
    nameZh: traditionalChineseName,
    nameZhOnDocument: printedChineseName,
    nameEn: '',
    birthDate: result.birthDate || null,
    gender: result.sex,
    nationality: null,
    nationalIdNumber: null,
    documentNumber: result.permitNumber,
    issuingCountry: null,
    expiryDate: result.expiryDate || null,
    ocrPayloadJson: JSON.stringify({
      engine: 'PaddleOCR',
      mrzUsed: result.mrzUsed,
      rotationDegrees: result.rotationDegrees,
      orientationAttempts:
        result.orientationAttempts,
      detectedItems: result.detectedItems,
      averageScore: result.averageScore,
      initializationMs: result.initializationMs,
      predictMs: result.predictMs,
      totalMs: result.totalMs,
      extractedFieldCount:
        result.extractedFieldCount,
      chineseNamePasses:
        result.chineseNamePasses,
      ocrInput: {
        resized: prepared.resized,
        originalWidth:
          prepared.originalWidth,
        originalHeight:
          prepared.originalHeight,
        workingWidth:
          prepared.workingWidth,
        workingHeight:
          prepared.workingHeight,
      },
      originalFields: {
        nameZh: result.chineseName,
        nameZhTraditional:
          traditionalChineseName,
        nameEn: '',
        birthDate:
          result.birthDate || null,
        gender: result.sex,
        nationality: null,
        nationalIdNumber: null,
        documentNumber:
          result.permitNumber,
        issuingCountry: null,
        expiryDate:
          result.expiryDate || null,
      },
    }),
  }
}

async function buildNationalIdItem(
  sourceFile: File,
  prepared: PreparedOcrInput,
): Promise<CreateScanItemRequest> {
  const file = prepared.file
  const result =
    await recognizeTaiwanNationalIdWithPaddle(
      file,
      progress => {
        progressMessage.value = progress.message
      },
    )

  await verifyDocumentTypeOnlyWhenNeeded(
    file,
    result.idChecksumValid ||
      Boolean(
        result.nationalId &&
          result.birthDate &&
          result.chineseName,
      ),
  )

  const orientedImage =
    result.orientedImage ?? file
  const reviewImage =
    await prepareReviewImage(orientedImage)
  const imageBase64 =
    await fileToBase64(reviewImage)
  const ocrInputImageBase64 =
    await fileToBase64(file)

  return {
    originalFileName: sourceFile.name,
    imageContentType:
      reviewImage.type ||
      file.type ||
      'image/jpeg',
    imageBase64,
    ocrInputImageContentType:
      file.type || 'image/jpeg',
    ocrInputImageBase64,
    nameZh: result.chineseName,
    nameZhOnDocument: result.chineseName,
    nameEn: '',
    birthDate: result.birthDate || null,
    gender: result.sex,
    nationality: 'TWN',
    nationalIdNumber: result.nationalId,
    documentNumber: result.nationalId,
    issuingCountry: 'TWN',
    expiryDate: null,
    ocrPayloadJson: JSON.stringify({
      engine: 'PaddleOCR',
      idChecksumValid: result.idChecksumValid,
      rotationDegrees: result.rotationDegrees,
      orientationAttempts:
        result.orientationAttempts,
      detectedItems: result.detectedItems,
      averageScore: result.averageScore,
      initializationMs: result.initializationMs,
      predictMs: result.predictMs,
      totalMs: result.totalMs,
      extractedFieldCount:
        result.extractedFieldCount,
      ocrInput: {
        resized: prepared.resized,
        originalWidth:
          prepared.originalWidth,
        originalHeight:
          prepared.originalHeight,
        workingWidth:
          prepared.workingWidth,
        workingHeight:
          prepared.workingHeight,
      },
      originalFields: {
        nameZh: result.chineseName,
        nameEn: '',
        birthDate:
          result.birthDate || null,
        gender: result.sex,
        nationality: 'TWN',
        nationalIdNumber: result.nationalId,
        documentNumber:
          result.nationalId,
        issuingCountry: 'TWN',
        expiryDate: null,
      },
    }),
  }
}

async function buildScanItem(file: File) {
  progressMessage.value =
    `正在準備「${file.name}」的 OCR 工作圖片…`

  const prepared =
    await prepareOcrInput(file)

  if (documentType.value === 'PASSPORT') {
    return buildPassportItem(
      file,
      prepared,
    )
  }

  if (
    documentType.value ===
    'TAIWAN_COMPATRIOT_PERMIT'
  ) {
    return buildPermitItem(
      file,
      prepared,
    )
  }

  if (
    documentType.value ===
    'TAIWAN_NATIONAL_ID'
  ) {
    return buildNationalIdItem(
      file,
      prepared,
    )
  }

  throw new Error('尚未選擇證件類型。')
}

async function runBatch(
  targetItems: BatchFileState[] = files.value,
) {
  if (
    running.value ||
    !selectedTourId.value ||
    !documentType.value ||
    !targetItems.length
  ) {
    return
  }

  const batchItems = [...targetItems]
  const retrying =
    batchItems.length !== files.value.length
  const alreadyCompletedCount =
    files.value.length - batchItems.length

  running.value = true
  error.value = ''
  completedCount.value =
    alreadyCompletedCount

  batchItems.forEach(item => {
    item.status = 'queued'
    item.message = retrying
      ? '等待重新辨識'
      : '等待辨識'
    item.elapsedMs = null
    item.detailRetry = 'none'
  })

  try {
    const batch = await createScanBatch(
      selectedTourId.value,
      documentType.value,
    )

    for (
      let index = 0;
      index < batchItems.length;
      index += 1
    ) {
      const item = batchItems[index]
      item.status = 'processing'
      item.message =
        `正在處理 ${index + 1} / ${batchItems.length}`

      const itemStartedAt = performance.now()

      try {
        progressMessage.value =
          retrying
            ? `正在重跑失敗項目 ${index + 1} / ${batchItems.length}…`
            : `正在辨識 ${index + 1} / ${batchItems.length}…`

        const request = await buildScanItem(item.file)
        await addScanItem(batch.scanBatchId, request)

        item.status = 'done'
        if (documentType.value === 'PASSPORT') {
          try {
            const metadata = JSON.parse(request.ocrPayloadJson ?? '{}') as {
              sourceDetailRetry?: { attempted?: boolean; accepted?: boolean }
            }
            item.detailRetry = metadata.sourceDetailRetry?.accepted
              ? 'accepted'
              : metadata.sourceDetailRetry?.attempted ? 'attempted' : 'none'
          } catch {
            item.detailRetry = 'none'
          }
        }
        item.message = documentType.value === 'PASSPORT' && !request.nameZh?.trim()
          ? '已加入待審核 · 中文姓名未辨出，請人工核對'
          : item.detailRetry === 'accepted'
            ? '已加入待審核 · 原圖補救取得姓名，請人工核對'
            : item.detailRetry === 'attempted'
              ? '已加入待審核 · 原圖補救未取得可信姓名，請人工核對'
              : '已加入待審核'
      } catch (err) {
        item.status = 'error'
        item.message =
          err instanceof Error
            ? err.message
            : '辨識失敗'
      } finally {
        item.elapsedMs =
          performance.now() - itemStartedAt
        completedCount.value =
          alreadyCompletedCount + index + 1
      }
    }

    const retryFailedCount =
      batchItems.filter(
        item => item.status === 'error',
      ).length
    const retrySuccessCount =
      batchItems.length - retryFailedCount

    await completeScanBatch(
      batch.scanBatchId,
      {
        attemptCount: batchItems.length,
        failedCount: retryFailedCount,
      },
    )

    if (retrying) {
      progressMessage.value =
        retryFailedCount > 0
          ? `重跑完成：成功 ${retrySuccessCount} 張，仍失敗 ${retryFailedCount} 張。`
          : `重跑完成：${retrySuccessCount} 張失敗項目已全部加入待審核。`
    } else {
      progressMessage.value =
        retryFailedCount > 0
          ? `批次完成：成功 ${retrySuccessCount} 張，失敗 ${retryFailedCount} 張。`
          : `批次完成：${retrySuccessCount} 張已全部加入待審核。`
    }
  } catch (err) {
    error.value =
      err instanceof Error
        ? err.message
        : '批次掃描執行失敗。'
  } finally {
    running.value = false
  }
}

function runPendingItems() {
  const pendingItems =
    files.value.filter(
      item => item.status !== 'done',
    )

  void runBatch(pendingItems)
}

function retryFailedItems() {
  const failedItems =
    files.value.filter(
      item => item.status === 'error',
    )

  void runBatch(failedItems)
}

watch(
  running,
  value => {
    emit('runningChange', value)
  },
  { immediate: true },
)

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!running.value) return

  event.preventDefault()
  event.returnValue = ''
}

watch(
  () => selectedTourId.value,
  async (tourId, previous) => {
    if (tourId === previous) return

    try {
      await loadTour(tourId)
    } catch (err) {
      error.value =
        err instanceof Error
          ? err.message
          : '團別資料載入失敗。'
    }
  },
)

watch(
  () => documentType.value,
  (next, previous) => {
    if (
      next &&
      previous &&
      next !== previous &&
      files.value.length &&
      !running.value
    ) {
      resetFiles()
    }
  },
)

onMounted(() => {
  window.addEventListener(
    'beforeunload',
    handleBeforeUnload,
  )

  void warmupPaddleOcr().catch(() => {
    // The normal scan flow will show the initialization error if warmup
    // cannot complete. Do not block the page while the user selects files.
  })
  void load()
})

onBeforeUnmount(() => {
  window.removeEventListener(
    'beforeunload',
    handleBeforeUnload,
  )

  void disposePassportV6ReviewRecognizer()
  emit('runningChange', false)
})
</script>

<template>
  <section class="page">
    <header class="page-header">
      <div>
        <p class="page-kicker">BATCH SCAN</p>
        <h1>證件掃描</h1>
        <p>
          選定團別與證件類型後一次上傳多張圖片，OCR
          完成後直接加入待審核清單。
        </p>
      </div>

      <button
        v-if="selectedTourId"
        type="button"
        class="secondary-action"
        @click="
          emit(
            'navigate',
            `/tours/${selectedTourId}`,
          )
        "
      >
        查看團別
      </button>
    </header>

    <p v-if="error" class="error-message">
      {{ error }}
    </p>

    <div v-if="loading" class="state-card">
      正在準備掃描工作區…
    </div>

    <template v-else>
      <section class="setup-card">
        <div class="step-label">
          <span>1</span>
          <div>
            <strong>選擇收件位置</strong>
            <small>先確認這批證件要放進哪一團。</small>
          </div>
        </div>

        <div class="setup-grid">
          <label>
            <span>團別</span>
            <select
              v-model="selectedTourId"
              :disabled="running"
            >
              <option value="" disabled>
                請選擇團別
              </option>
              <option
                v-for="tour in tours"
                :key="tour.tourId"
                :value="tour.tourId"
              >
                {{ tour.tourName }}
                · {{ tour.departureDate }}
              </option>
            </select>
          </label>

          <label>
            <span>本批證件類型</span>
            <select
              v-model="documentType"
              :disabled="running || !detail"
            >
              <option value="" disabled>
                選擇證件
              </option>
              <option
                v-for="type in availableDocumentTypes"
                :key="type"
                :value="type"
              >
                {{ documentLabel(type) }}
              </option>
            </select>
          </label>
        </div>

        <div
          v-if="selectedTour"
          class="tour-context"
        >
          <div>
            <strong>{{ selectedTour.tourName }}</strong>
            <span>
              {{ selectedTour.departureDate }}
              →
              {{ selectedTour.returnDate }}
            </span>
          </div>
          <span>
            此團需收：
            {{
              availableDocumentTypes
                .map(documentLabel)
                .join('、')
            }}
          </span>
        </div>
      </section>

      <section class="upload-card">
        <div class="step-label">
          <span>2</span>
          <div>
            <strong>加入同類型證件</strong>
            <small>
              正常照片直接辨識；只有結果可疑時才額外確認證件類型。
            </small>
          </div>
        </div>

        <div class="upload-heading">
          <div>
            <h2>
              {{
                documentType
                  ? `批次上傳 · ${documentLabel(documentType)}`
                  : '批次上傳'
              }}
            </h2>
            <p>
              同一批只能放同一種證件；不同證件請完成後再開下一批。
            </p>
          </div>

          <div class="upload-actions">
            <button
              v-if="files.length && !running"
              type="button"
              class="text-action"
              @click="resetFiles"
            >
              清空
            </button>

            <label
              class="file-button"
              :class="{ disabled: running || !documentType }"
            >
              選擇圖片
              <input
                type="file"
                accept="image/*"
                multiple
                :disabled="running || !documentType"
                @change="chooseFiles"
              />
            </label>
          </div>
        </div>

        <div
          class="drop-zone"
          :class="{
            active: dragActive,
            disabled: running || !documentType,
          }"
          @dragenter.prevent="dragActive = true"
          @dragover.prevent="dragActive = true"
          @dragleave.prevent="dragActive = false"
          @drop.prevent="onDrop"
        >
          <template v-if="!documentType">
            <strong>請先選擇團別與證件類型</strong>
            <span>確認後才可以加入圖片。</span>
          </template>

          <template v-else-if="!files.length">
            <span class="drop-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 16V5M8 9l4-4 4 4M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
              </svg>
            </span>
            <strong>拖曳多張圖片到這裡</strong>
            <span>
              或按右上角「選擇圖片」；單張上限 15 MB。
            </span>
          </template>

          <template v-else>
            <strong>還可以繼續拖入更多圖片</strong>
            <span>
              重複檔案會自動忽略。
            </span>
          </template>
        </div>

        <div
          v-if="files.length"
          class="batch-summary"
        >
          <span>
            共 {{ files.length }} 張
            · 成功 {{ successCount }}
            <template v-if="failedCount">
              · 失敗 {{ failedCount }}
            </template>
            <template v-if="averageCompletedMs !== null">
              · 平均 {{ (averageCompletedMs / 1000).toFixed(1) }} 秒/張
            </template>
          </span>
          <span>
            {{ completedCount }} / {{ files.length }}
          </span>
        </div>

        <progress
          v-if="running || completedCount"
          :value="progressPercent"
          max="100"
        ></progress>

        <p
          v-if="progressMessage"
          class="progress-message"
        >
          {{ progressMessage }}
        </p>

        <div
          v-if="files.length"
          class="file-list"
        >
          <div
            v-for="(item, index) in files"
            :key="`${item.file.name}-${item.file.lastModified}`"
            class="file-row"
          >
            <div class="file-main">
              <span
                class="file-index"
                aria-hidden="true"
              >
                {{ index + 1 }}
              </span>
              <div>
                <strong>{{ item.file.name }}</strong>
                <span>
                  {{
                    (
                      item.file.size /
                      1024 /
                      1024
                    ).toFixed(2)
                  }}
                  MB
                  <template v-if="item.elapsedMs !== null">
                    · {{ (item.elapsedMs / 1000).toFixed(1) }} 秒
                  </template>
                </span>
              </div>
            </div>

            <div class="file-row-actions">
              <span
                class="file-status"
                :class="item.status"
              >
                {{
                  item.status === 'queued'
                    ? '等待'
                    : item.status === 'processing'
                      ? '辨識中'
                      : item.status === 'done'
                        ? '已加入待審核'
                        : '失敗'
                }}
              </span>

              <button
                v-if="!running && item.status !== 'done'"
                type="button"
                class="remove-button"
                aria-label="移除此檔案"
                @click="removeFile(index)"
              >
                ×
              </button>
            </div>

            <small
              v-if="
                item.status === 'error' ||
                item.status === 'processing'
              "
              :class="{ error: item.status === 'error' }"
            >
              {{ item.message }}
            </small>
          </div>
        </div>

        <div
          v-if="batchFinished"
          class="batch-complete"
          :class="{ partial: failedCount > 0 }"
        >
          <div>
            <strong>
              {{
                failedCount
                  ? '這批已處理完成，但有部分圖片需要重新確認'
                  : '這批已全部加入待審核'
              }}
            </strong>
            <span>
              {{
                failedCount
                  ? `成功 ${successCount} 張、失敗 ${failedCount} 張。`
                  : '現在可以回到團別統一進行人工審核。'
              }}
            </span>
          </div>

          <div class="batch-complete-actions">
            <button
              v-if="failedCount"
              type="button"
              class="retry-button"
              @click="retryFailedItems"
            >
              只重跑失敗 {{ failedCount }} 張
            </button>

            <button
              type="button"
              @click="
                emit(
                  'navigate',
                  `/tours/${selectedTourId}`,
                )
              "
            >
              回團別審核
            </button>
          </div>
        </div>

        <footer class="upload-footer">
          <span>
            OCR 完成即可離開；人工審核不需要在這一頁逐張做。
          </span>

          <button
            type="button"
            class="primary-action"
            :disabled="
              running ||
              !selectedTourId ||
              !documentType ||
              !runnableCount ||
              batchFinished
            "
            @click="runPendingItems"
          >
            {{
              running
                ? `辨識中 ${progressPercent}%`
                : `開始辨識 ${runnableCount || ''} 張`
            }}
          </button>
        </footer>
      </section>
    </template>
  </section>
</template>

<style scoped>
.page {
  display: grid;
  gap: 22px;
}

.page-header {
  display: flex;
  gap: 24px;
  align-items: flex-start;
  justify-content: space-between;
}

.page-header h1 {
  margin: 3px 0 7px;
  color: #182236;
  font-size: 29px;
  letter-spacing: -.025em;
}

.page-header p:not(.page-kicker) {
  max-width: 720px;
  margin: 0;
  color: #6f7b8e;
  font-size: 13px;
  line-height: 1.6;
}

.page-kicker {
  margin: 0;
  color: #8792a3;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .14em;
}

.setup-card,
.upload-card {
  padding: 19px;
  border: 1px solid #dde3ec;
  border-radius: 15px;
  background: #fff;
  box-shadow: 0 1px 2px rgb(15 23 42 / 2%);
}

.step-label {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 16px;
}

.step-label > span {
  width: 27px;
  height: 27px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 8px;
  background: #1b293f;
  color: #fff;
  font-size: 11px;
  font-weight: 800;
}

.step-label > div {
  display: grid;
  gap: 2px;
}

.step-label strong {
  color: #243148;
  font-size: 13px;
}

.step-label small {
  color: #7a8799;
  font-size: 10px;
}

.setup-grid {
  display: grid;
  grid-template-columns:
    repeat(2, minmax(0, 1fr));
  gap: 11px;
}

.setup-grid label {
  display: grid;
  gap: 6px;
  color: #425067;
  font-size: 11px;
  font-weight: 700;
}

.setup-grid select {
  min-height: 43px;
  padding: 0 11px;
  border: 1px solid #d2dae5;
  border-radius: 9px;
  outline: 0;
  background: #fff;
  color: #2e3a4f;
  font: inherit;
}

.setup-grid select:focus {
  border-color: #99a7b9;
  box-shadow: 0 0 0 3px rgb(40 54 75 / 6%);
}

.tour-context {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-top: 14px;
  padding: 12px 13px;
  border-radius: 10px;
  background: #f6f8fa;
}

.tour-context > div {
  display: grid;
  gap: 2px;
}

.tour-context strong {
  color: #334158;
  font-size: 12px;
}

.tour-context span {
  color: #758197;
  font-size: 10px;
}

.upload-card {
  display: grid;
  gap: 15px;
}

.upload-heading {
  display: flex;
  gap: 20px;
  align-items: flex-start;
  justify-content: space-between;
}

.upload-heading h2 {
  margin: 0 0 5px;
  color: #182236;
  font-size: 17px;
}

.upload-heading p {
  margin: 0;
  color: #748095;
  font-size: 11px;
}

.upload-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.file-button,
.primary-action,
.secondary-action,
.text-action {
  border-radius: 9px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.file-button {
  display: inline-flex;
  align-items: center;
  min-height: 39px;
  padding: 0 14px;
  border: 1px solid #d7dfe9;
  background: #f5f7fa;
  color: #3d4b61;
  font-size: 12px;
}

.file-button:hover {
  border-color: #bfc9d7;
  background: #eef2f6;
}

.file-button input {
  display: none;
}

.file-button.disabled {
  cursor: not-allowed;
  opacity: .5;
}

.text-action {
  min-height: 36px;
  padding: 0 8px;
  border: 0;
  background: transparent;
  color: #778398;
  font-size: 11px;
}

.primary-action {
  min-height: 42px;
  padding: 0 16px;
  border: 1px solid #172033;
  background: #172033;
  color: #fff;
}

.secondary-action {
  min-height: 42px;
  padding: 0 15px;
  border: 1px solid #d4dce7;
  background: #fff;
  color: #26334a;
}

.drop-zone {
  min-height: 122px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 6px;
  padding: 20px;
  border: 1.5px dashed #cfd8e5;
  border-radius: 12px;
  background: #fafbfc;
  color: #748095;
  text-align: center;
  transition:
    border-color .15s ease,
    background .15s ease;
}

.drop-zone.active {
  border-color: #62738d;
  background: #f0f4f8;
}

.drop-zone.disabled {
  opacity: .62;
}

.drop-zone strong {
  color: #46536a;
  font-size: 12px;
}

.drop-zone > span:not(.drop-icon) {
  font-size: 10px;
}

.drop-icon {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  background: #eef2f6;
  color: #65758b;
}

.drop-icon svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}

.batch-summary {
  display: flex;
  justify-content: space-between;
  color: #68758a;
  font-size: 11px;
}

progress {
  width: 100%;
  height: 7px;
  overflow: hidden;
  border: 0;
  border-radius: 999px;
}

.progress-message {
  margin: -6px 0 0;
  color: #6d798c;
  font-size: 11px;
}

.file-list {
  display: grid;
  max-height: 420px;
  overflow: auto;
  border: 1px solid #e1e7ef;
  border-radius: 11px;
}

.file-row {
  display: grid;
  grid-template-columns:
    minmax(0, 1fr) auto;
  gap: 7px 12px;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid #edf1f5;
}

.file-row:last-child {
  border-bottom: 0;
}

.file-main {
  min-width: 0;
  display: flex;
  gap: 10px;
  align-items: center;
}

.file-index {
  width: 25px;
  height: 25px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 8px;
  background: #f0f3f7;
  color: #6e7b90;
  font-size: 10px;
  font-weight: 750;
}

.file-main > div {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.file-main strong {
  overflow: hidden;
  color: #2d394e;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-main span {
  color: #8792a2;
  font-size: 10px;
}

.file-row-actions {
  display: flex;
  gap: 7px;
  align-items: center;
}

.file-row small {
  grid-column: 1 / -1;
  padding-left: 35px;
  color: #758197;
  font-size: 10px;
  line-height: 1.5;
}

.file-row small.error {
  color: #b23c32;
}

.file-status {
  padding: 4px 8px;
  border-radius: 999px;
  background: #f0f3f6;
  color: #6d798c;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}

.file-status.processing {
  background: #fff4dc;
  color: #926313;
}

.file-status.done {
  background: #eaf7ef;
  color: #237447;
}

.file-status.error {
  background: #fdeceb;
  color: #ad352d;
}

.remove-button {
  width: 27px;
  height: 27px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: #f2f4f7;
  color: #7b8799;
  font-size: 17px;
  cursor: pointer;
}

.batch-complete {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  padding: 12px 13px;
  border: 1px solid #cae7d5;
  border-radius: 10px;
  background: #f2faf5;
}

.batch-complete.partial {
  border-color: #eed9ad;
  background: #fff9ee;
}

.batch-complete > div {
  display: grid;
  gap: 2px;
}

.batch-complete strong {
  color: #286847;
  font-size: 11px;
}

.batch-complete.partial strong {
  color: #89611d;
}

.batch-complete span {
  color: #6f7c8e;
  font-size: 10px;
}

.batch-complete-actions {
  display: flex !important;
  gap: 8px !important;
  align-items: center;
}

.batch-complete button {
  min-height: 35px;
  padding: 0 11px;
  border: 1px solid #ccd7e3;
  border-radius: 8px;
  background: #fff;
  color: #35445b;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.batch-complete.partial .retry-button {
  border-color: #e1c992;
  background: #fffaf0;
  color: #865b14;
}

.upload-footer {
  display: flex;
  gap: 20px;
  align-items: center;
  justify-content: space-between;
  padding-top: 3px;
}

.upload-footer > span {
  color: #778397;
  font-size: 10px;
}

.error-message {
  margin: 0;
  color: #bd3328;
  font-size: 11px;
}

.state-card {
  display: grid;
  place-items: center;
  min-height: 230px;
  border: 1px dashed #d6deea;
  border-radius: 13px;
  color: #7a8698;
  text-align: center;
}

button:disabled {
  cursor: not-allowed;
  opacity: .5;
}

@media (max-width: 720px) {
  .page-header,
  .upload-heading,
  .upload-footer,
  .batch-complete {
    align-items: stretch;
    flex-direction: column;
  }

  .batch-complete-actions {
    width: 100%;
    align-items: stretch;
    flex-direction: column;
  }

  .batch-complete-actions button {
    width: 100%;
  }

  .setup-grid {
    grid-template-columns: 1fr;
  }

  .tour-context {
    align-items: flex-start;
    flex-direction: column;
  }

  .upload-actions {
    justify-content: flex-end;
  }
}
</style>
