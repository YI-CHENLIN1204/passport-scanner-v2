export interface PermitRawNameEvidenceLike {
  latinRowCount: number
  labelRowCount: number
  candidateCount: number
  compatibleCandidateCount: number
  unknownCandidateCount: number
  conflictCandidateCount: number
  officialVariantCandidateCount: number
  selectedOfficialVariant: boolean
  joinedTokenCandidateCount: number
  selectedJoinedToken: boolean
  conflictTokenCountMismatchCandidateCount: number
  conflictOneSyllableMismatchCandidateCount: number
  conflictOtherMismatchCandidateCount: number
  conflictUnclassifiedCandidateCount: number
  shortExactConflictCandidateCount: number
  nearestConflictLatinDistance: number | null
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
    samplesWithOfficialVariantCandidate:
      rows.filter(row => (row?.officialVariantCandidateCount ?? 0) > 0).length,
    selectedOfficialVariant:
      rows.filter(row => row?.selectedOfficialVariant === true).length,
    samplesWithJoinedTokenCandidate:
      rows.filter(row => (row?.joinedTokenCandidateCount ?? 0) > 0).length,
    selectedJoinedToken:
      rows.filter(row => row?.selectedJoinedToken === true).length,
    samplesWithConflictTokenCountMismatch:
      rows.filter(row => (row?.conflictTokenCountMismatchCandidateCount ?? 0) > 0).length,
    samplesWithConflictOneSyllableMismatch:
      rows.filter(row => (row?.conflictOneSyllableMismatchCandidateCount ?? 0) > 0).length,
    samplesWithConflictOtherMismatch:
      rows.filter(row => (row?.conflictOtherMismatchCandidateCount ?? 0) > 0).length,
    samplesWithConflictUnclassified:
      rows.filter(row => (row?.conflictUnclassifiedCandidateCount ?? 0) > 0).length,
    samplesWithShortExactConflictCandidate:
      rows.filter(row => (row?.shortExactConflictCandidateCount ?? 0) > 0).length,
    samplesConflictDistanceLe2:
      rows.filter(row => row?.nearestConflictLatinDistance !== null && row?.nearestConflictLatinDistance !== undefined && row.nearestConflictLatinDistance <= 2).length,
    samplesConflictDistance3To4:
      rows.filter(row => row?.nearestConflictLatinDistance !== null && row?.nearestConflictLatinDistance !== undefined && row.nearestConflictLatinDistance >= 3 && row.nearestConflictLatinDistance <= 4).length,
    samplesConflictDistance5Plus:
      rows.filter(row => row?.nearestConflictLatinDistance !== null && row?.nearestConflictLatinDistance !== undefined && row.nearestConflictLatinDistance >= 5).length,
    totalCandidates:
      rows.reduce((sum, row) => sum + (row?.candidateCount ?? 0), 0),
    selectedCompatible:
      rows.filter(row => row?.selectedCompatibility === 'compatible').length,
    selectedUnknown:
      rows.filter(row => row?.selectedCompatibility === 'unknown').length,
    selectedNone:
      rows.filter(row => row && row.selectedCompatibility === null).length,
  }
}
