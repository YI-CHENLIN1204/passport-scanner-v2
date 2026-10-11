export interface PassportShadowCandidate {
  text: string
  score: number
  rank: number
  subtype: string
  exactStandalone: boolean
  anchored: boolean
}

export type PassportShadowDecision =
  | 'eligible'
  | 'no-candidate'
  | 'ambiguous'
  | 'unanchored'
  | 'not-standalone'
  | 'weak-evidence'
  | 'wrong-subtype'
  | 'existing-accepted'

/**
 * Read-only eligibility check. Never use ground truth or mutate production
 * selection. Distinct Han names cannot be merged merely by score.
 */
export function evaluatePassportOneSyllableShadow(
  candidates: readonly PassportShadowCandidate[],
  hasAcceptedName: boolean,
): { decision: PassportShadowDecision; text: string | null } {
  if (hasAcceptedName) return { decision: 'existing-accepted', text: null }
  if (!candidates.length) return { decision: 'no-candidate', text: null }
  const distinct = new Set(candidates.map(item => item.text))
  if (distinct.size !== 1) return { decision: 'ambiguous', text: null }
  if (candidates.some(item => item.subtype !== 'one-syllable-mismatch'))
    return { decision: 'wrong-subtype', text: null }
  if (!candidates.every(item => item.exactStandalone))
    return { decision: 'not-standalone', text: null }
  if (!candidates.every(item => item.anchored))
    return { decision: 'unanchored', text: null }
  if (!candidates.some(item => item.score >= 0.78 && item.rank >= 1.35))
    return { decision: 'weak-evidence', text: null }
  return { decision: 'eligible', text: candidates[0].text }
}
