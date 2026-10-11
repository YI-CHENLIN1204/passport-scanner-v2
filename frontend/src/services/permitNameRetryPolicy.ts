/**
 * Review-stage OCR candidate policy for Taiwan Compatriot Permits.
 * No evidence is written to any traveler or document record here.
 */
export interface PermitNameAttempt {
  value: string
  score: number
  confidence: number
  consensus: number
}

export function shouldRetryUncertainPermitName(
  currentName: string,
  currentConfidence: number | null,
  validatedMrzName: boolean,
): boolean {
  if (!currentName.trim()) return true
  if (validatedMrzName) return false
  return currentConfidence === null || currentConfidence < 0.9
}

export function shouldUseRetriedPermitName(
  currentName: string,
  currentConfidence: number | null,
  attempt: PermitNameAttempt | null,
): boolean {
  if (!attempt?.value.trim()) return false
  if (!currentName.trim()) return true
  if (attempt.value.trim() === currentName.trim()) return false
  // A single new OCR reading cannot override an existing name.
  // Two independent name-region crops must agree with high confidence.
  if (attempt.consensus < 2) return false
  if (attempt.score < 0.86 || attempt.confidence < 0.92) return false
  // Avoid replacing an already strong value.
  return currentConfidence === null || currentConfidence < 0.88
}
