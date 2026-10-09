import type { PassportReviewDraft } from '../models/passportReview'
import type { TaiwanCompatriotPermitReviewDraft } from '../models/taiwanCompatriotPermitReview'
import type { TaiwanNationalIdReviewDraft } from '../models/taiwanNationalIdReview'

export interface HealthResponse {
  status: string
  service: string
  timestamp: string
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch(`${apiBaseUrl}/api/health`)

  if (!response.ok) {
    throw new Error(`API health check failed: ${response.status}`)
  }

  return response.json() as Promise<HealthResponse>
}


export interface PassportReviewValidationResponse {
  accepted: boolean
  persistence: 'validated-only'
  receivedAt: string
  warnings: string[]
}

interface ValidationProblemDetails {
  title?: string
  errors?: Record<string, string[]>
}

function withTourId(path: string, tourId?: string) {
  if (!tourId) return path

  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}tourId=${encodeURIComponent(tourId)}`
}

function flattenValidationProblem(problem: ValidationProblemDetails) {
  const messages = Object.values(problem.errors ?? {}).flat()
  return messages.length
    ? messages.join(' ')
    : problem.title ?? '後端資料驗證失敗。'
}

export async function validatePassportReview(
  draft: PassportReviewDraft,
): Promise<PassportReviewValidationResponse> {
  const response = await fetch(
    `${apiBaseUrl}/api/passport-reviews/validate`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(draft),
    },
  )

  if (!response.ok) {
    let message = `Passport review validation failed: ${response.status}`

    try {
      const problem =
        (await response.json()) as ValidationProblemDetails
      message = flattenValidationProblem(problem)
    } catch {
      // Keep the status-only message when the response is not JSON.
    }

    throw new Error(message)
  }

  return response.json() as Promise<PassportReviewValidationResponse>
}


export type PassportReviewSaveAction =
  | 'CreatedTravelerAndDocument'
  | 'CreatedDocumentVersion'
  | 'UpdatedExistingDocument'

export interface PassportReviewSaveResponse {
  accepted: boolean
  persistence: 'postgresql'
  action: PassportReviewSaveAction
  travelerId: string
  documentVersionId: string
  travelerDocumentVersionCount: number
  savedAt: string
  warnings: string[]
}

interface ApiConflict {
  code?: string
  message?: string
}

export async function savePassportReview(
  draft: PassportReviewDraft,
  tourId?: string,
): Promise<PassportReviewSaveResponse> {
  const response = await fetch(
    withTourId(
      `${apiBaseUrl}/api/passport-reviews`,
      tourId,
    ),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(draft),
    },
  )

  if (!response.ok) {
    if (response.status === 409) {
      try {
        const conflict = (await response.json()) as ApiConflict
        throw new Error(
          conflict.message ??
            '找到多位可能相同的旅客，需要人工選擇，系統沒有自動合併。',
        )
      } catch (err) {
        if (err instanceof Error) throw err
      }
    }

    let message = `Passport review save failed: ${response.status}`

    try {
      const problem =
        (await response.json()) as ValidationProblemDetails
      message = flattenValidationProblem(problem)
    } catch {
      // Keep the status-only message when the response is not JSON.
    }

    throw new Error(message)
  }

  return response.json() as Promise<PassportReviewSaveResponse>
}

export interface PassportStoreStatusResponse {
  persistence: 'postgresql'
  travelerCount: number
  documentVersionCount: number
  checkedAt: string
}

export async function getPassportStoreStatus() {
  const response = await fetch(
    `${apiBaseUrl}/api/passport-reviews/store-status`,
  )

  if (!response.ok) {
    throw new Error(
      `Passport store status failed: ${response.status}`,
    )
  }

  return response.json() as Promise<PassportStoreStatusResponse>
}


export interface TaiwanCompatriotPermitReviewSaveResponse {
  accepted: boolean
  persistence: 'postgresql'
  action: PassportReviewSaveAction
  travelerId: string
  documentVersionId: string
  travelerDocumentVersionCount: number
  savedAt: string
  warnings: string[]
}

export async function saveTaiwanCompatriotPermitReview(
  draft: TaiwanCompatriotPermitReviewDraft,
  tourId?: string,
): Promise<TaiwanCompatriotPermitReviewSaveResponse> {
  const response = await fetch(
    withTourId(
      `${apiBaseUrl}/api/taiwan-compatriot-permit-reviews`,
      tourId,
    ),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(draft),
    },
  )

  if (!response.ok) {
    if (response.status === 409) {
      try {
        const conflict = (await response.json()) as ApiConflict
        throw new Error(
          conflict.message ??
            '找到多位可能相同的旅客，需要人工選擇，系統沒有自動合併。',
        )
      } catch (err) {
        if (err instanceof Error) throw err
      }
    }

    let message =
      `Taiwan compatriot permit review save failed: ${response.status}`

    try {
      const problem =
        (await response.json()) as ValidationProblemDetails
      message = flattenValidationProblem(problem)
    } catch {
      // Keep the status-only message when the response is not JSON.
    }

    throw new Error(message)
  }

  return response.json() as Promise<TaiwanCompatriotPermitReviewSaveResponse>
}


export interface TravelerSummaryResponse {
  travelerId: string
  nameZh: string
  nameEn: string
  birthDate: string
  gender: string
  nationality: string | null
  nationalIdNumber: string | null
  documentVersionCount: number
  currentDocumentTypes: string[]
}

export interface DocumentVersionResponse {
  documentVersionId: string
  documentType: string
  nameZhOnDocument: string
  nameEnOnDocument: string
  documentNumber: string
  issuingCountry: string | null
  nationality: string | null
  expiryDate: string | null
  isCurrent: boolean
  verifiedAt: string
  createdAt: string
}

export interface TravelerDetailResponse {
  traveler: TravelerSummaryResponse
  documents: DocumentVersionResponse[]
}

export interface DocumentStoreStatusResponse {
  persistence: 'postgresql'
  travelerCount: number
  documentVersionCount: number
  checkedAt: string
}

export async function getDocumentStoreStatus() {
  const response = await fetch(
    `${apiBaseUrl}/api/document-store/status`,
  )

  if (!response.ok) {
    throw new Error(
      `Document store status failed: ${response.status}`,
    )
  }

  return response.json() as Promise<DocumentStoreStatusResponse>
}

export interface TravelerSearchFilters {
  documentType?: string
  gender?: string
  nationality?: string
  offset?: number
}

export async function searchTravelers(
  query = '',
  limit = 20,
  filters: TravelerSearchFilters = {},
) {
  const params = new URLSearchParams()

  if (query.trim()) {
    params.set('query', query.trim())
  }

  if (filters.documentType?.trim()) {
    params.set(
      'documentType',
      filters.documentType.trim(),
    )
  }

  if (filters.gender?.trim()) {
    params.set('gender', filters.gender.trim())
  }

  if (filters.nationality?.trim()) {
    params.set(
      'nationality',
      filters.nationality.trim(),
    )
  }

  if (
    filters.offset !== undefined &&
    filters.offset > 0
  ) {
    params.set(
      'offset',
      String(Math.floor(filters.offset)),
    )
  }

  params.set('limit', String(limit))

  const response = await fetch(
    `${apiBaseUrl}/api/travelers?${params.toString()}`,
  )

  if (!response.ok) {
    let message =
      `Traveler search failed: ${response.status}`

    try {
      const body = (await response.json()) as {
        message?: string
      }
      message = body.message ?? message
    } catch {
      // Keep status-only message.
    }

    throw new Error(message)
  }

  return response.json() as Promise<TravelerSummaryResponse[]>
}

export async function getTravelerDetail(
  travelerId: string,
) {
  const response = await fetch(
    `${apiBaseUrl}/api/travelers/${travelerId}`,
  )

  if (response.status === 404) return null

  if (!response.ok) {
    throw new Error(
      `Traveler detail failed: ${response.status}`,
    )
  }

  return response.json() as Promise<TravelerDetailResponse>
}



export interface UpdateTravelerDocumentRequest {
  documentVersionId: string
  nameZhOnDocument: string
  nameEnOnDocument: string
  documentNumber: string
  issuingCountry: string | null
  nationality: string | null
  expiryDate: string | null
}

export interface UpdateTravelerRequest {
  nameZh: string
  nameEn: string
  birthDate: string
  gender: string
  nationality: string | null
  nationalIdNumber: string | null
  documents: UpdateTravelerDocumentRequest[]
}

export async function updateTraveler(
  travelerId: string,
  request: UpdateTravelerRequest,
) {
  const response = await fetch(
    `${apiBaseUrl}/api/travelers/${encodeURIComponent(travelerId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    },
  )

  if (!response.ok) {
    let message =
      `Update traveler failed: ${response.status}`

    try {
      const body = (await response.json()) as {
        message?: string
      }
      message = body.message ?? message
    } catch {
      // Keep status-only message.
    }

    throw new Error(message)
  }

  return response.json() as Promise<TravelerDetailResponse>
}

export async function mergeTravelers(
  targetTravelerId: string,
  sourceTravelerId: string,
) {
  const response = await fetch(
    `${apiBaseUrl}/api/travelers/${encodeURIComponent(targetTravelerId)}/merge`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sourceTravelerId,
      }),
    },
  )

  if (!response.ok) {
    let message =
      `Merge travelers failed: ${response.status}`

    try {
      const body = (await response.json()) as {
        message?: string
      }
      message = body.message ?? message
    } catch {
      // Keep status-only message.
    }

    throw new Error(message)
  }

  return response.json() as Promise<
    TravelerDetailResponse
  >
}

export interface TaiwanNationalIdReviewSaveResponse {
  accepted: boolean
  persistence: 'postgresql'
  action: PassportReviewSaveAction
  travelerId: string
  documentVersionId: string
  travelerDocumentVersionCount: number
  savedAt: string
  warnings: string[]
}

export async function saveTaiwanNationalIdReview(
  draft: TaiwanNationalIdReviewDraft,
  tourId?: string,
): Promise<TaiwanNationalIdReviewSaveResponse> {
  const response = await fetch(
    withTourId(
      `${apiBaseUrl}/api/taiwan-national-id-reviews`,
      tourId,
    ),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(draft),
    },
  )

  if (!response.ok) {
    if (response.status === 409) {
      try {
        const conflict = (await response.json()) as ApiConflict
        throw new Error(
          conflict.message ??
            '找到多位可能相同的旅客，需要人工選擇，系統沒有自動合併。',
        )
      } catch (err) {
        if (err instanceof Error) throw err
      }
    }

    let message =
      `Taiwan national ID review save failed: ${response.status}`

    try {
      const problem =
        (await response.json()) as ValidationProblemDetails
      message = flattenValidationProblem(problem)
    } catch {
      // Keep the status-only message when the response is not JSON.
    }

    throw new Error(message)
  }

  return response.json() as Promise<TaiwanNationalIdReviewSaveResponse>
}


export interface TourSummaryResponse {
  tourId: string
  tourName: string
  departureDate: string
  returnDate: string
  requiredDocumentTypes: string[]
  reviewedMemberCount: number
  documentCount: number
  memberCount: number
  receivedDocumentCount: number
  pendingReviewCount: number
  updatedAt: string
}

export interface TourMemberDocumentResponse {
  documentVersionId: string
  documentType: string
  nameZhOnDocument: string
  nameEnOnDocument: string
  documentNumber: string
  issuingCountry: string | null
  nationality: string | null
  expiryDate: string | null
  isCurrent: boolean
  verifiedAt: string
}

export interface TourMemberResponse {
  tourMemberId: string
  travelerId: string
  nameZh: string
  nameEn: string
  birthDate: string
  gender: string
  nationality: string | null
  nationalIdNumber: string | null
  documents: TourMemberDocumentResponse[]
}

export interface TourDetailResponse {
  tour: TourSummaryResponse
  members: TourMemberResponse[]
}

export interface CreateTourRequest {
  tourName: string
  departureDate: string
  returnDate: string
  requiredDocumentTypes: string[]
}

export interface UpdateTourRequest
  extends CreateTourRequest {}

export interface TourListFilters {
  status?: string
  documentType?: string
  departureFrom?: string
  departureTo?: string
}

export async function listTours(
  query = '',
  filters: TourListFilters = {},
) {
  const params = new URLSearchParams()

  if (query.trim()) {
    params.set('query', query.trim())
  }

  if (filters.status?.trim()) {
    params.set('status', filters.status.trim())
  }

  if (filters.documentType?.trim()) {
    params.set(
      'documentType',
      filters.documentType.trim(),
    )
  }

  if (filters.departureFrom?.trim()) {
    params.set(
      'departureFrom',
      filters.departureFrom.trim(),
    )
  }

  if (filters.departureTo?.trim()) {
    params.set(
      'departureTo',
      filters.departureTo.trim(),
    )
  }

  const suffix = params.toString()
    ? `?${params.toString()}`
    : ''

  const response = await fetch(
    `${apiBaseUrl}/api/tours${suffix}`,
  )

  if (!response.ok) {
    let message =
      `Tour list failed: ${response.status}`

    try {
      const body = (await response.json()) as {
        message?: string
      }
      message = body.message ?? message
    } catch {
      // Keep status-only message.
    }

    throw new Error(message)
  }

  return response.json() as Promise<TourSummaryResponse[]>
}

export async function createTour(
  request: CreateTourRequest,
) {
  const response = await fetch(
    `${apiBaseUrl}/api/tours`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    },
  )

  if (!response.ok) {
    let message = `Create tour failed: ${response.status}`

    try {
      const body = (await response.json()) as {
        message?: string
      }
      message = body.message ?? message
    } catch {
      // Keep status message when response is not JSON.
    }

    throw new Error(message)
  }

  return response.json() as Promise<TourSummaryResponse>
}

export async function updateTour(
  tourId: string,
  request: UpdateTourRequest,
) {
  const response = await fetch(
    `${apiBaseUrl}/api/tours/${encodeURIComponent(tourId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    },
  )

  if (!response.ok) {
    let message =
      `Update tour failed: ${response.status}`

    try {
      const body = (await response.json()) as {
        message?: string
      }
      message = body.message ?? message
    } catch {
      // Keep status-only message.
    }

    throw new Error(message)
  }

  return response.json() as Promise<TourSummaryResponse>
}

export async function getTourDetail(tourId: string) {
  const response = await fetch(
    `${apiBaseUrl}/api/tours/${encodeURIComponent(tourId)}`,
  )

  if (response.status === 404) return null

  if (!response.ok) {
    throw new Error(
      `Tour detail failed: ${response.status}`,
    )
  }

  return response.json() as Promise<TourDetailResponse>
}

export async function downloadTourCsv(
  tourId: string,
  filename: string,
) {
  const response = await fetch(
    `${apiBaseUrl}/api/tours/${encodeURIComponent(tourId)}/export.csv`,
  )

  if (!response.ok) {
    throw new Error(
      `Tour export failed: ${response.status}`,
    )
  }

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)

  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}


export interface ScanBatchResponse {
  scanBatchId: string
  tourId: string
  documentType: string
  status: string
  itemCount: number
  attemptCount: number
  failedCount: number
  createdAt: string
  updatedAt: string
}

export interface CreateScanItemRequest {
  originalFileName: string
  imageContentType: string
  imageBase64: string
  ocrInputImageContentType: string | null
  ocrInputImageBase64: string | null
  nameZh: string
  nameZhOnDocument: string
  nameEn: string
  birthDate: string | null
  gender: string
  nationality: string | null
  nationalIdNumber: string | null
  documentNumber: string
  issuingCountry: string | null
  expiryDate: string | null
  ocrPayloadJson: string
}

export interface ScanItemResponse {
  scanItemId: string
  scanBatchId: string
  draftPersonId: string
  documentType: string
  originalFileName: string
  imageContentType: string
  imageAvailable: boolean
  nameZh: string
  nameZhOnDocument: string
  nameEn: string
  birthDate: string | null
  gender: string
  nationality: string | null
  nationalIdNumber: string | null
  documentNumber: string
  issuingCountry: string | null
  expiryDate: string | null
  savedDocumentVersionId: string | null
  reviewStatus: 'PENDING' | 'REVIEWED'
  trainingSelected: boolean
  reviewedAt: string | null
  deleteAfter: string
  createdAt: string
  updatedAt: string
}

export interface ReviewQueuePersonResponse {
  draftPersonId: string
  nameZh: string
  birthDate: string | null
  gender: string
  documents: ScanItemResponse[]
}

export interface ReviewScanItemRequest {
  nameZh: string
  nameZhOnDocument?: string | null
  nameEn: string
  birthDate: string | null
  gender: string
  nationality: string | null
  nationalIdNumber: string | null
  documentNumber: string
  issuingCountry: string | null
  expiryDate: string | null
  useForTraining?: boolean
}

export async function createScanBatch(
  tourId: string,
  documentType: string,
) {
  const response = await fetch(
    `${apiBaseUrl}/api/tours/${encodeURIComponent(tourId)}/scan-batches`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ documentType }),
    },
  )

  if (!response.ok) {
    let message = `Create scan batch failed: ${response.status}`

    try {
      const body = (await response.json()) as { message?: string }
      message = body.message ?? message
    } catch {
      // Keep the status-only message.
    }

    throw new Error(message)
  }

  return response.json() as Promise<ScanBatchResponse>
}

export async function listScanBatches(
  tourId: string,
  limit = 5,
) {
  const params = new URLSearchParams({
    limit: String(limit),
  })

  const response = await fetch(
    `${apiBaseUrl}/api/tours/${encodeURIComponent(tourId)}/scan-batches?${params.toString()}`,
  )

  if (!response.ok) {
    let message =
      `Scan batch history failed: ${response.status}`

    try {
      const body = (await response.json()) as {
        message?: string
      }
      message = body.message ?? message
    } catch {
      // Keep status-only message.
    }

    throw new Error(message)
  }

  return response.json() as Promise<ScanBatchResponse[]>
}

export async function completeScanBatch(
  batchId: string,
  outcome: {
    attemptCount: number
    failedCount: number
  },
) {
  const response = await fetch(
    `${apiBaseUrl}/api/scan-batches/${encodeURIComponent(batchId)}/complete`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(outcome),
    },
  )

  if (!response.ok) {
    let message =
      `Complete scan batch failed: ${response.status}`

    try {
      const body = (await response.json()) as {
        message?: string
      }
      message = body.message ?? message
    } catch {
      // Keep status-only message.
    }

    throw new Error(message)
  }

  return response.json() as Promise<ScanBatchResponse>
}

export async function addScanItem(
  batchId: string,
  request: CreateScanItemRequest,
) {
  const response = await fetch(
    `${apiBaseUrl}/api/scan-batches/${encodeURIComponent(batchId)}/items`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    },
  )

  if (!response.ok) {
    let message =
      response.status === 413
        ? '覆核圖片資料過大，伺服器拒絕接收。請重新整理到最新版後再試；若仍發生，請改用較小的原始圖片。'
        : `Add scan item failed: ${response.status}`

    try {
      const body = (await response.json()) as { message?: string }
      message = body.message ?? message
    } catch {
      // Keep the friendly status-specific message when the response
      // is not JSON (for example an Nginx 413 HTML response).
    }

    throw new Error(message)
  }

  return response.json() as Promise<ScanItemResponse>
}

export async function getReviewQueue(tourId: string) {
  const response = await fetch(
    `${apiBaseUrl}/api/tours/${encodeURIComponent(tourId)}/review-queue`,
  )

  if (!response.ok) {
    throw new Error(
      `Review queue failed: ${response.status}`,
    )
  }

  return response.json() as Promise<ReviewQueuePersonResponse[]>
}

export function getScanItemImageUrl(scanItemId: string) {
  return `${apiBaseUrl}/api/scan-items/${encodeURIComponent(scanItemId)}/image`
}

export async function reviewScanItem(
  scanItemId: string,
  request: ReviewScanItemRequest,
) {
  const response = await fetch(
    `${apiBaseUrl}/api/scan-items/${encodeURIComponent(scanItemId)}/review`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    },
  )

  if (!response.ok) {
    let message = `Review scan item failed: ${response.status}`

    try {
      const body = (await response.json()) as { message?: string }
      message = body.message ?? message
    } catch {
      // Keep the status-only message.
    }

    throw new Error(message)
  }

  return response.json() as Promise<ScanItemResponse>
}


export interface OcrBenchmarkFieldMetric {
  field: string
  comparedCount: number
  exactMatchCount: number
  exactMatchRate: number
  missingPredictionCount: number
  missingPredictionRate: number
  wrongPredictionCount: number
  wrongPredictionRate: number
  directOrientationComparedCount: number
  directOrientationExactRate: number
  retriedOrientationComparedCount: number
  retriedOrientationExactRate: number
}

export interface OcrBenchmarkSignalMetric {
  signal: string
  observedCount: number
  positiveCount: number
  positiveRate: number
}

export interface OcrBenchmarkDocumentSummary {
  documentType: string
  reviewedSampleCount: number
  scoredSampleCount: number
  fullDocumentExactCount: number
  fullDocumentExactRate: number
  manualCorrectionCount: number
  manualCorrectionRate: number
  averageTotalMs: number | null
  medianTotalMs: number | null
  p90TotalMs: number | null
  averageOrientationAttempts: number | null
  fallbackRate: number | null
  signals: OcrBenchmarkSignalMetric[]
  fields: OcrBenchmarkFieldMetric[]
}

export interface OcrBenchmarkSummaryResponse {
  generatedAt: string
  reviewedSampleCount: number
  scoredSampleCount: number
  documents: OcrBenchmarkDocumentSummary[]
}

export interface TrainingDatasetDocumentSummary {
  documentType: string
  sampleCount: number
  trainCount: number
  validationCount: number
  testCount: number
}

export interface TrainingDatasetSummaryResponse {
  sampleCount: number
  trainCount: number
  validationCount: number
  testCount: number
  documents: TrainingDatasetDocumentSummary[]
  generatedAt: string
}

export async function getOcrBenchmarkSummary() {
  const response = await fetch(
    `${apiBaseUrl}/api/ocr-benchmark/summary`,
  )

  if (!response.ok) {
    throw new Error(
      `OCR benchmark failed: ${response.status}`,
    )
  }

  return response.json() as Promise<OcrBenchmarkSummaryResponse>
}

export interface OcrBenchmarkRunResponse {
  benchmarkRunId: string
  pipelineVersion: string
  sampleCount: number
  failedCount: number
  baselineCreatedCount: number
  summaryJson: string
  createdAt: string
}

export async function listOcrBenchmarkRuns(
  limit = 10,
) {
  const params = new URLSearchParams({
    limit: String(limit),
  })
  const response = await fetch(
    `${apiBaseUrl}/api/ocr-benchmark/runs?${params.toString()}`,
  )

  if (!response.ok) {
    throw new Error(
      `OCR benchmark history failed: ${response.status}`,
    )
  }

  return response.json() as Promise<
    OcrBenchmarkRunResponse[]
  >
}

export async function saveOcrBenchmarkRun(
  request: {
    pipelineVersion: string
    sampleCount: number
    failedCount: number
    baselineCreatedCount: number
    summaryJson: string
  },
) {
  const response = await fetch(
    `${apiBaseUrl}/api/ocr-benchmark/runs`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    },
  )

  if (!response.ok) {
    let message =
      `OCR benchmark history save failed: ${response.status}`

    try {
      const body = (await response.json()) as {
        message?: string
      }
      message = body.message ?? message
    } catch {
      // Keep status-only message.
    }

    throw new Error(message)
  }

  return response.json() as Promise<
    OcrBenchmarkRunResponse
  >
}

export interface TrainingEvaluationSampleResponse {
  trainingSampleId: string
  documentType: string
  split: 'train' | 'validation' | 'test'
  originalOcrJson: string
  evaluationBaselineJson: string | null
  groundTruthJson: string
  hasExactOcrInput: boolean
}

export async function getTrainingEvaluationSamples(
  split:
    | 'train'
    | 'validation'
    | 'test'
    | 'fixed-test' = 'test',
) {
  const params = new URLSearchParams({ split })
  const response = await fetch(
    `${apiBaseUrl}/api/ocr-training/evaluation-samples?${params.toString()}`,
  )

  if (!response.ok) {
    let message =
      `Evaluation samples failed: ${response.status}`

    try {
      const body = (await response.json()) as {
        message?: string
      }
      message = body.message ?? message
    } catch {
      // Keep status message.
    }

    throw new Error(message)
  }

  return response.json() as Promise<
    TrainingEvaluationSampleResponse[]
  >
}

export async function saveTrainingEvaluationBaseline(
  trainingSampleId: string,
  resultJson: string,
) {
  const response = await fetch(
    `${apiBaseUrl}/api/ocr-training/samples/${encodeURIComponent(
      trainingSampleId,
    )}/evaluation-baseline`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ resultJson }),
    },
  )

  if (!response.ok) {
    let message =
      `Evaluation baseline save failed: ${response.status}`

    try {
      const body = (await response.json()) as {
        message?: string
      }
      message = body.message ?? message
    } catch {
      // Keep status-only message.
    }

    throw new Error(message)
  }

  return response.json() as Promise<{
    trainingSampleId: string
    resultJson: string
    capturedAt: string
  }>
}

export async function getTrainingSampleImageFile(
  trainingSampleId: string,
) {
  const response = await fetch(
    `${apiBaseUrl}/api/ocr-training/samples/${encodeURIComponent(
      trainingSampleId,
    )}/image`,
  )

  if (!response.ok) {
    throw new Error(
      `Training sample image failed: ${response.status}`,
    )
  }

  const blob = await response.blob()
  const type =
    blob.type ||
    response.headers.get('Content-Type') ||
    'image/jpeg'

  return new File(
    [blob],
    `training-sample-${trainingSampleId}`,
    { type },
  )
}

export async function getTrainingDatasetSummary() {
  const response = await fetch(
    `${apiBaseUrl}/api/ocr-training/summary`,
  )

  if (!response.ok) {
    throw new Error(
      `Training dataset summary failed: ${response.status}`,
    )
  }

  return response.json() as Promise<TrainingDatasetSummaryResponse>
}

export async function setTrainingSampleSelection(
  scanItemId: string,
  selected: boolean,
) {
  const response = await fetch(
    `${apiBaseUrl}/api/scan-items/${encodeURIComponent(scanItemId)}/training-selection`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ selected }),
    },
  )

  if (!response.ok) {
    let message =
      `Training selection failed: ${response.status}`

    try {
      const body = (await response.json()) as {
        message?: string
      }
      message = body.message ?? message
    } catch {
      // Keep status-only message.
    }

    throw new Error(message)
  }

  return response.json() as Promise<{
    scanItemId: string
    selected: boolean
    trainingSampleId: string | null
    updatedAt: string
  }>
}

export async function downloadTrainingDataset() {
  const response = await fetch(
    `${apiBaseUrl}/api/ocr-training/export.zip`,
  )

  if (!response.ok) {
    throw new Error(
      `Training dataset export failed: ${response.status}`,
    )
  }

  const blob = await response.blob()
  const contentDisposition =
    response.headers.get('Content-Disposition') ?? ''
  const filenameMatch =
    contentDisposition.match(/filename="?([^";]+)"?/i)
  const filename =
    filenameMatch?.[1] ??
    'ocr-training-dataset.zip'
  const url = URL.createObjectURL(blob)

  try {
    const anchor =
      document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}


export async function deleteScanItem(
  scanItemId: string,
) {
  const response = await fetch(
    `${apiBaseUrl}/api/scan-items/${encodeURIComponent(scanItemId)}`,
    { method: 'DELETE' },
  )

  if (!response.ok) {
    let message =
      `Delete scan item failed: ${response.status}`

    try {
      const body = (await response.json()) as {
        message?: string
      }
      message = body.message ?? message
    } catch {
      // Keep status-only message.
    }

    throw new Error(message)
  }
}
