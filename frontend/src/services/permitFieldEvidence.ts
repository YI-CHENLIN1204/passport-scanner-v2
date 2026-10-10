/** Conservative permit field evidence helpers, with no OCR or identity storage. */
export interface PermitCandidateEvidence<T> {
  value: T
  score: number | null
  rank: number
}

export function selectPermitNameCandidate(
  labeled: PermitCandidateEvidence<string> | null,
  phonetic: readonly PermitCandidateEvidence<string>[],
  hasLatinAnchors: boolean,
  hasNearbyLatinName: boolean,
): PermitCandidateEvidence<string> | null {
  const winner = [...phonetic].sort((a, b) => b.rank - a.rank)[0]
  if (winner) return winner
  if (!labeled) return null

  // A nearby Latin name with an explicit phonetic conflict cannot be
  // bypassed just because a Chinese name was next to a label.
  if (hasNearbyLatinName) return null
  // Unrelated OCR Latin text elsewhere is not enough to suppress a strong
  // labeled Chinese name. Weak labels still require manual entry.
  if (hasLatinAnchors && (labeled.score ?? 0) < 0.82) return null
  return labeled
}

export type PermitEvidenceSex = '' | 'M' | 'F' | 'X'

export function selectPermitSexCandidate(
  mrzSex: PermitEvidenceSex,
  mrzRequiredValid: boolean,
  labeledSex: PermitEvidenceSex,
  labeledScore: number | null,
  semanticSex: PermitEvidenceSex,
): PermitEvidenceSex {
  if (mrzRequiredValid && mrzSex) return mrzSex

  // Only overrule an unvalidated MRZ character when explicit labeled
  // extraction AND row semantics agree with sufficiently strong OCR.
  if (
    labeledSex &&
    labeledSex === semanticSex &&
    (labeledScore ?? 0) >= 0.8
  ) return labeledSex

  return mrzSex || labeledSex || semanticSex || ''
}
