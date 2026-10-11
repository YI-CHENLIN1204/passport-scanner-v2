// Aggregate only non-identifying counters from Validation. Do not add
// traveler IDs, raw OCR lines, image data or ground truth to this shape.
export interface PermitSourceEvidence {
  distanceCropUsed: boolean
  nameRetryApplied: boolean
  nameRetryConsensus: number
  mrzUsed: boolean
}

export function aggregatePermitSourceEvidence(
  rows: readonly (PermitSourceEvidence | null)[],
) {
  return {
    distanceCropUsed: rows.filter(row => row?.distanceCropUsed === true).length,
    nameRetryApplied: rows.filter(row => row?.nameRetryApplied === true).length,
    nameRetryConsensus: rows.filter(row => (row?.nameRetryConsensus ?? 0) >= 2).length,
    mrzUsed: rows.filter(row => row?.mrzUsed === true).length,
  }
}
