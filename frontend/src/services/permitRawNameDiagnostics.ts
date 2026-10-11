export interface PermitRawNameEvidenceLike {
  latinRowCount: number
  labelRowCount: number
  candidateCount: number
  compatibleCandidateCount: number
  unknownCandidateCount: number
  conflictCandidateCount: number
  selectedCompatibility: 'compatible' | 'unknown' | 'conflict' | null
}

export function aggregatePermitRawNameEvidence(
  rows: readonly (PermitRawNameEvidenceLike | null)[],
) {
  return {
    samplesWithLatinRows:
      rows.filter(row => (row?.latinRowCount ?? 0) > 0).length,
    samplesWithLabelRows:
      rows.filter(row => (row?.labelRowCount ?? 0) > 0).length,
    samplesWithCompatibleCandidate:
      rows.filter(row => (row?.compatibleCandidateCount ?? 0) > 0).length,
    samplesWithUnknownCandidate:
      rows.filter(row => (row?.unknownCandidateCount ?? 0) > 0).length,
    samplesWithConflictCandidate:
      rows.filter(row => (row?.conflictCandidateCount ?? 0) > 0).length,
    totalCandidates:
      rows.reduce((sum, row) => sum + (row?.candidateCount ?? 0), 0),
    selectedCompatible:
      rows.filter(row => row?.selectedCompatibility === 'compatible').length,
    selectedUnknown:
      rows.filter(row => row?.selectedCompatibility === 'unknown').length,
    selectedConflictFallback:
      rows.filter(row => row?.selectedCompatibility === 'conflict').length,
    selectedNone:
      rows.filter(row => row && row.selectedCompatibility === null).length,
  }
}
