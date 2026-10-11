export type PermitRawNameCompatibility =
  | 'compatible'
  | 'unknown'
  | 'conflict'

export interface PermitRawNameCandidate {
  value: string
  compatibility: PermitRawNameCompatibility
  latinDistance: number | null
  labelDistance: number | null
  exactRow: boolean
  officialVariantPromotion?: boolean
  joinedTokenPromotion?: boolean
  oneSyllableFallbackPromotion?: boolean
  conflictSubtype?:
    | 'token-count-mismatch'
    | 'one-syllable-mismatch'
    | 'other-mismatch'
    | 'unclassified'
    | null
}

function compactHanLength(value: string) {
  return Array.from(
    value.replace(/[\s·‧]/g, ''),
  ).length
}

export function isShortExactPermitNameConflict(
  candidate: PermitRawNameCandidate,
) {
  const length = compactHanLength(candidate.value)
  return (
    candidate.compatibility === 'conflict' &&
    candidate.exactRow &&
    length >= 2 &&
    length <= 4
  )
}

function rankAcceptedCandidate(
  candidate: PermitRawNameCandidate,
) {
  const latinNear =
    candidate.latinDistance === null
      ? 0
      : Math.max(0, 1.2 - candidate.latinDistance * 0.18)
  const labelNear =
    candidate.labelDistance === null
      ? 0
      : Math.max(0, 1.1 - candidate.labelDistance * 0.22)

  const compatibility =
    candidate.compatibility === 'compatible'
      ? 4
      : 1

  if (
    candidate.compatibility === 'unknown' &&
    (candidate.labelDistance === null || candidate.labelDistance > 2) &&
    (candidate.latinDistance === null || candidate.latinDistance > 2)
  ) {
    return null
  }

  return (
    compatibility +
    latinNear +
    labelNear +
    (candidate.exactRow ? 0.25 : 0)
  )
}

export function selectPermitRawNameCandidate(
  candidates: readonly PermitRawNameCandidate[],
): PermitRawNameCandidate | null {
  const accepted = candidates
    .filter(candidate => candidate.compatibility !== 'conflict')
    .map(candidate => ({
      candidate,
      rank: rankAcceptedCandidate(candidate),
    }))
    .filter(
      (
        item,
      ): item is {
        candidate: PermitRawNameCandidate
        rank: number
      } => item.rank !== null,
    )
    .sort((a, b) => b.rank - a.rank)[0]

  if (accepted) return accepted.candidate

  const shortExactConflicts =
    candidates.filter(isShortExactPermitNameConflict)

  if (
    shortExactConflicts.length === 1 &&
    shortExactConflicts[0].conflictSubtype === 'one-syllable-mismatch'
  ) {
    return {
      ...shortExactConflicts[0],
      oneSyllableFallbackPromotion: true,
    }
  }

  return null
}
