import {
  compareChineseNameToMrzWithOfficialVariants,
  type RomanizationCompatibility,
} from './nameRomanization'

/** Narrow OCR review suggestion — do not overwrite an existing chosen name.
 * Candidate has already passed the original geometric/label eligibility
 * check. Do not treat a partial syllable mismatch as a positive match.
 */
export interface ReviewNameCandidate {
  text: string
  score: number
  rank: number
  romanizationStatus: RomanizationCompatibility
}

export function guardedOfficialNameSuggestion<T extends ReviewNameCandidate>(
  candidates: readonly T[],
  mrz: { surname: string; givenNames: string } | null,
): (T & { romanizationStatus: 'compatible' }) | null {
  if (!mrz?.surname || !mrz.givenNames) return null

  const acceptable = candidates.filter(candidate =>
    candidate.romanizationStatus === 'conflict' &&
    candidate.score >= 0.78 &&
    compareChineseNameToMrzWithOfficialVariants(
      candidate.text, mrz.surname, mrz.givenNames,
    ) === 'compatible',
  )

  // A plausible but ambiguous result must remain unfilled and reviewed.
  if (new Set(acceptable.map(candidate => candidate.text)).size !== 1) {
    return null
  }

  const best = [...acceptable].sort((a, b) => b.rank - a.rank)[0]
  if (!best) return null
  return { ...best, romanizationStatus: 'compatible' }
}
