// Validation only: count selected local retry OCR observations without
// exposing recognized text, geometry coordinates, photos or sample IDs.
export interface PermitRetryDetectionSummary {
  attemptedCrops: number
  cropsWithTextBoxes: number
  cropsWithNameCandidates: number
}
export function summarizePermitRetryDetection(
  observations: readonly { hasBoxes: boolean; hasCandidate: boolean }[],
): PermitRetryDetectionSummary {
  return {
    attemptedCrops: observations.length,
    cropsWithTextBoxes: observations.filter(row => row.hasBoxes).length,
    cropsWithNameCandidates: observations.filter(row => row.hasCandidate).length,
  }
}
export function aggregatePermitRetryDetection(
  summaries: readonly (PermitRetryDetectionSummary | null)[],
) {
  return {
    scansWithRetry: summaries.filter(row => row !== null && row.attemptedCrops > 0).length,
    attemptedCrops: summaries.reduce((n, row) => n + (row?.attemptedCrops ?? 0), 0),
    cropsWithTextBoxes: summaries.reduce((n, row) => n + (row?.cropsWithTextBoxes ?? 0), 0),
    cropsWithNameCandidates: summaries.reduce((n, row) => n + (row?.cropsWithNameCandidates ?? 0), 0),
  }
}
