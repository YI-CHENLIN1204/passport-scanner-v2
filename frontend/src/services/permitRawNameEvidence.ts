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
}

function compactHanLength(value: string) {
  return Array.from(
    value.replace(/[\s·‧]/g, ''),
  ).length
}

export function isConservativeConflictFallback(
  candidate: PermitRawNameCandidate,
) {
  const length = compactHanLength(candidate.value)

  return (
    candidate.compatibility === 'conflict' &&
    candidate.exactRow &&
    candidate.latinDistance !== null &&
    candidate.latinDistance <= 4 &&
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

  // Last-resort visual fallback for legacy/non-standard romanization:
  // only a short, standalone Han row near a parsed
  // Latin name may survive a phonetic conflict. This never outranks a
  // compatible/unknown candidate.
  const fallbackCandidates =
    candidates.filter(isConservativeConflictFallback)

  if (fallbackCandidates.length !== 1) {
    return null
  }

  return fallbackCandidates[0]
}
