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

export async function searchTravelers(
  query = '',
  limit = 20,
) {
  const params = new URLSearchParams()
  if (query.trim()) params.set('query', query.trim())
  params.set('limit', String(limit))

  const response = await fetch(
    `${apiBaseUrl}/api/travelers?${params.toString()}`,
  )

  if (!response.ok) {
    throw new Error(
      `Traveler search failed: ${response.status}`,
    )
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
  documentNumber: string
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

export async function listTours(query = '') {
  const params = new URLSearchParams()
  if (query.trim()) params.set('query', query.trim())

  const suffix = params.toString()
    ? `?${params.toString()}`
    : ''

  const response = await fetch(
    `${apiBaseUrl}/api/tours${suffix}`,
  )

  if (!response.ok) {
    throw new Error(
      `Tour list failed: ${response.status}`,
    )
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
  createdAt: string
  updatedAt: string
}

export interface CreateScanItemRequest {
  originalFileName: string
  imageContentType: string
  imageBase64: string
  nameZh: string
  nameEn: string
  birthDate: string | null
  gender: string
  nationality: string | null
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
  nameZh: string
  nameEn: string
  birthDate: string | null
  gender: string
  nationality: string | null
  documentNumber: string
  issuingCountry: string | null
  expiryDate: string | null
  reviewStatus: 'PENDING' | 'REVIEWED'
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
  nameEn: string
  birthDate: string | null
  gender: string
  nationality: string | null
  documentNumber: string
  issuingCountry: string | null
  expiryDate: string | null
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
    let message = `Add scan item failed: ${response.status}`

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
