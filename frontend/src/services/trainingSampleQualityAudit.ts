export interface SampleQualityInput {
  documentType: string
  groundTruthJson: string
}

export interface SampleQualityAudit {
  total: number
  flagged: number
  invalidBirthDates: number
  suspiciousDates: number
  missingNames: number
  invalidNationalIds: number
  placeholderSignals: number
}

/** Anonymous, read-only ground-truth hygiene check.
 * Never return names, IDs, dates, or sample identifiers.
 * These are review flags, not automatic exclusions.
 */
export function auditSampleGroundTruth(
  samples: readonly SampleQualityInput[],
  validateNationalId: (value: string) => boolean,
): SampleQualityAudit {
  const result: SampleQualityAudit = {
    total: samples.length,
    flagged: 0,
    invalidBirthDates: 0,
    suspiciousDates: 0,
    missingNames: 0,
    invalidNationalIds: 0,
    placeholderSignals: 0,
  }
  for (const sample of samples) {
    let data: Record<string, unknown> = {}
    try {
      const parsed: unknown = JSON.parse(sample.groundTruthJson)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        data = parsed as Record<string, unknown>
    } catch { /* invalid serialized annotation is flagged below */ }

    const name = typeof data.nameZh === 'string' ? data.nameZh.trim() : ''
    const birth = typeof data.birthDate === 'string' ? data.birthDate.trim() : ''
    const nationalId = typeof data.nationalIdNumber === 'string'
      ? data.nationalIdNumber.trim().toUpperCase() : ''
    let flagged = false
    if (!name || !/[\p{Script=Han}]/u.test(name)) {
      result.missingNames++
      flagged = true
    }
    const match = /^(\d{4})-(\d\d)-(\d\d)$/.exec(birth)
    const date = match ? new Date(Date.UTC(+match[1]!, +match[2]! - 1, +match[3]!)) : null
    const validDate = !!(match && date &&
      date.getUTCFullYear() === +match[1]! &&
      date.getUTCMonth() + 1 === +match[2]! &&
      date.getUTCDate() === +match[3]!)
    if (!validDate) {
      result.invalidBirthDates++
      flagged = true
    } else if (+match![1]! < 1900 || date! > new Date()) {
      result.suspiciousDates++
      flagged = true
    }
    // National ID is optional for many passports; validate only if present.
    if (nationalId && !validateNationalId(nationalId)) {
      result.invalidNationalIds++
      flagged = true
    }
    if (/^(?:TEST|DUMMY|XXXX|測試|姓名未知)/iu.test(name) ||
        (name.length > 1 && [...name].every(ch => ch === name[0]))) {
      result.placeholderSignals++
      flagged = true
    }
    if (flagged) result.flagged++
  }
  return result
}
