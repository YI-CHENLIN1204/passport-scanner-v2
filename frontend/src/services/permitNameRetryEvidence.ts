export type PermitNameRetryRegion = 'anchored' | 'broad'

export interface PermitNameRetryCandidateEvidence {
  value: string
  score: number | null
  region: PermitNameRetryRegion
}

export function selectPermitRetryWinner(
  candidates: readonly PermitNameRetryCandidateEvidence[],
  completedPasses: number,
) {
  if (!candidates.length) return null

  const grouped = new Map<string, PermitNameRetryCandidateEvidence[]>()
  for (const candidate of candidates) {
    const group = grouped.get(candidate.value) ?? []
    group.push(candidate)
    grouped.set(candidate.value, group)
  }

  return [...grouped.entries()]
    .map(([value, group]) => {
      const bestScore = Math.max(...group.map(item => item.score ?? 0))
      const independentRegions = new Set(group.map(item => item.region)).size
      const repeatedObservationBonus =
        group.length > independentRegions ? 0.02 : 0
      const confidence = Math.min(
        0.99,
        bestScore +
          (independentRegions >= 2 ? 0.06 : 0) +
          repeatedObservationBonus,
      )

      return {
        value,
        score: bestScore,
        rank:
          independentRegions * 2 +
          bestScore +
          repeatedObservationBonus,
        passes: completedPasses,
        consensus: independentRegions,
        confidence,
      }
    })
    .sort((a, b) => b.rank - a.rank)[0]
}
