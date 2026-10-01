import type { PassportReviewDraft } from '../models/passportReview'
import type { TaiwanCompatriotPermitReviewDraft } from '../models/taiwanCompatriotPermitReview'

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
  persistence: 'volatile-in-memory'
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
): Promise<PassportReviewSaveResponse> {
  const response = await fetch(
    `${apiBaseUrl}/api/passport-reviews`,
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
  persistence: 'volatile-in-memory'
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
  persistence: 'volatile-in-memory'
  action: PassportReviewSaveAction
  travelerId: string
  documentVersionId: string
  travelerDocumentVersionCount: number
  savedAt: string
  warnings: string[]
}

export async function saveTaiwanCompatriotPermitReview(
  draft: TaiwanCompatriotPermitReviewDraft,
): Promise<TaiwanCompatriotPermitReviewSaveResponse> {
  const response = await fetch(
    `${apiBaseUrl}/api/taiwan-compatriot-permit-reviews`,
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
  expiryDate: string
  isCurrent: boolean
  verifiedAt: string
  createdAt: string
}

export interface TravelerDetailResponse {
  traveler: TravelerSummaryResponse
  documents: DocumentVersionResponse[]
}

export interface DocumentStoreStatusResponse {
  persistence: 'volatile-in-memory'
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
