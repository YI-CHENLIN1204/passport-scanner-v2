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

export function selectPermitRawNameCandidate(
  candidates: readonly PermitRawNameCandidate[],
): PermitRawNameCandidate | null {
  const ranked = candidates
    .filter(candidate => candidate.compatibility !== 'conflict')
    .map(candidate => {
      const latinNear =
        candidate.latinDistance === null
          ? 0
          : Math.max(0, 1.2 - candidate.latinDistance * 0.18)
      const labelNear =
        candidate.labelDistance === null
          ? 0
          : Math.max(0, 1.1 - candidate.labelDistance * 0.22)

      // A romanization-compatible Han row is strongest evidence even when
      // OCR row grouping separated it by several visual rows.
      const compatibility =
        candidate.compatibility === 'compatible'
          ? 4
          : 1

      // Unknown romanization needs a nearby visual/row anchor; otherwise a
      // random Chinese authority/place row must not become the traveler name.
      if (
        candidate.compatibility === 'unknown' &&
        (candidate.labelDistance === null || candidate.labelDistance > 2) &&
        (candidate.latinDistance === null || candidate.latinDistance > 2)
      ) {
        return null
      }

      return {
        candidate,
        rank:
          compatibility +
          latinNear +
          labelNear +
          (candidate.exactRow ? 0.25 : 0),
      }
    })
    .filter(
      (
        item,
      ): item is {
        candidate: PermitRawNameCandidate
        rank: number
      } => item !== null,
    )
    .sort((a, b) => b.rank - a.rank)

  return ranked[0]?.candidate ?? null
}
