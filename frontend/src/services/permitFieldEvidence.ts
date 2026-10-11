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

export type PermitSexEvidenceSource =
  | 'visual-agreement'
  | 'semantic-row'
  | 'mrz'
  | 'label'
  | 'semantic'
  | 'standalone-token'
  | 'focused-retry'
  | 'empty'

export function selectPermitSexEvidence(
  mrzSex: PermitEvidenceSex,
  mrzRequiredValid: boolean,
  labeledSex: PermitEvidenceSex,
  labeledScore: number | null,
  semanticSex: PermitEvidenceSex,
  standaloneSex: PermitEvidenceSex = '',
): {
  value: PermitEvidenceSex
  source: PermitSexEvidenceSource
} {
  // Taiwan permit MRZ validation explicitly skips the sex character.
  // Therefore requiredValid=true does not validate M/F. When a same-row
  // printed Sex/性別 label gives direct semantic evidence, it may safely
  // override a conflicting MRZ character.
  if (
    labeledSex &&
    labeledSex === semanticSex &&
    (labeledScore ?? 0) >= (mrzRequiredValid ? 0.9 : 0.8)
  ) {
    return {
      value: labeledSex,
      source: 'visual-agreement',
    }
  }

  if (
    semanticSex &&
    mrzSex &&
    semanticSex !== mrzSex
  ) {
    return {
      value: semanticSex,
      source: 'semantic-row',
    }
  }

  if (mrzSex) {
    return {
      value: mrzSex,
      source: 'mrz',
    }
  }

  if (labeledSex) {
    return {
      value: labeledSex,
      source: 'label',
    }
  }

  if (semanticSex) {
    return {
      value: semanticSex,
      source: 'semantic',
    }
  }

  if (standaloneSex) {
    return {
      value: standaloneSex,
      source: 'standalone-token',
    }
  }

  return {
    value: '',
    source: 'empty',
  }
}

export function selectPermitSexCandidate(
  mrzSex: PermitEvidenceSex,
  mrzRequiredValid: boolean,
  labeledSex: PermitEvidenceSex,
  labeledScore: number | null,
  semanticSex: PermitEvidenceSex,
  standaloneSex: PermitEvidenceSex = '',
): PermitEvidenceSex {
  return selectPermitSexEvidence(
    mrzSex,
    mrzRequiredValid,
    labeledSex,
    labeledScore,
    semanticSex,
    standaloneSex,
  ).value
}

/** Permit MRZ composite check digit does not verify GBK name bytes.
 * Use a stronger visual cross-check to resolve a conflict; otherwise
 * retain original preference without claiming MRZ-name verification.
 */
export function selectPermitMrzVsVisualName(
  mrzName: string,
  rowName: string,
  rowRomanizationStatus: 'compatible' | 'unknown' | 'conflict',
  labelName: string,
  labelScore: number | null,
): { value: string; source: 'mrz' | 'visual-agreement' | 'row' | 'label' | 'empty' } {
  const mrz = mrzName.trim()
  const row = rowName.trim()
  const label = labelName.trim()
  const trustedVisual = row &&
    row === label &&
    rowRomanizationStatus === 'compatible' &&
    (labelScore ?? 0) >= 0.88

  if (trustedVisual && (!mrz || mrz !== row)) {
    return { value: row, source: 'visual-agreement' }
  }
  if (mrz) return { value: mrz, source: 'mrz' }
  if (row) return { value: row, source: 'row' }
  if (label) return { value: label, source: 'label' }
  return { value: '', source: 'empty' }
}
