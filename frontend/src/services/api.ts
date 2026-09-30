import type { PassportReviewDraft } from '../models/passportReview'

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
