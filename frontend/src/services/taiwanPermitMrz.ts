export interface TaiwanPermitMrzValidation {
  permitNumber: boolean | null
  issueCount: boolean | null
  expiryDate: boolean | null
  birthDate: boolean | null
  composite: boolean | null
  requiredValid: boolean
}

export interface ParsedTaiwanPermitMrz {
  line1: string
  line2: string
  line3: string
  permitNumber: string
  issueCount: string
  expiryDate: string
  birthDate: string
  sex: '' | 'M' | 'F' | 'X'
  chineseName: string
  latinName: string
  validation: TaiwanPermitMrzValidation
}

function normalize(value: string) {
  return value
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9<]/g, '')
}

function characterValue(character: string) {
  if (character === '<') return 0
  if (/\d/.test(character)) return Number(character)

  const code = character.charCodeAt(0)
  if (code >= 65 && code <= 90) {
    return code - 55
  }

  return 0
}

function calculateCheckDigit(value: string) {
  const weights = [7, 3, 1]

  const sum = [...value].reduce(
    (total, character, index) =>
      total +
      characterValue(character) *
        weights[index % weights.length],
    0,
  )

  return String(sum % 10)
}

function validateCheckDigit(
  value: string,
  expected: string,
) {
  if (!/^\d$/.test(expected)) return null
  return calculateCheckDigit(value) === expected
}

function normalizeLine(
  value: string,
  expectedLength = 30,
) {
  const normalized = normalize(value)

  if (normalized.length === expectedLength) {
    return normalized
  }

  if (normalized.length > expectedLength) {
    const ctIndex = normalized.indexOf('CT')
    if (ctIndex >= 0 && ctIndex + expectedLength <= normalized.length) {
      return normalized.slice(
        ctIndex,
        ctIndex + expectedLength,
      )
    }

    return normalized.slice(0, expectedLength)
  }

  return normalized
}

function decodeChineseName(value: string) {
  const compact = value
    .replace(/<+$/g, '')
    .replace(/[^A-P]/g, '')

  if (!compact || compact.length % 4 !== 0) {
    return ''
  }

  const hex = [...compact]
    .map((character) =>
      (character.charCodeAt(0) - 65)
        .toString(16)
        .toUpperCase(),
    )
    .join('')

  if (hex.length % 2 !== 0) return ''

  const bytes = new Uint8Array(
    hex.match(/.{2}/g)?.map((pair) =>
      Number.parseInt(pair, 16),
    ) ?? [],
  )

  try {
    return new TextDecoder('gbk')
      .decode(bytes)
      .replace(/\u0000/g, '')
      .trim()
  } catch {
    return ''
  }
}

function centuryFromCode(code: string) {
  if (code === 'A') return 1900
  if (code === 'B') return 2000
  if (code === 'C') return 2100
  return null
}

function normalizeDate(
  yymmdd: string,
  century: number | null,
  kind: 'birth' | 'expiry',
) {
  if (!/^\d{6}$/.test(yymmdd)) return ''

  const yy = Number(yymmdd.slice(0, 2))
  const month = Number(yymmdd.slice(2, 4))
  const day = Number(yymmdd.slice(4, 6))

  let year: number

  if (century !== null) {
    year = century + yy
  } else if (kind === 'birth') {
    const currentYear = new Date().getFullYear()
    year = 2000 + yy
    if (year > currentYear) year -= 100
  } else {
    const currentYear = new Date().getFullYear()
    const candidates = [
      1900 + yy,
      2000 + yy,
      2100 + yy,
    ]

    year = candidates.sort(
      (a, b) =>
        Math.abs(a - currentYear) -
        Math.abs(b - currentYear),
    )[0]
  }

  const date = new Date(
    Date.UTC(year, month - 1, day),
  )

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return ''
  }

  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-')
}

function cleanLatinName(value: string) {
  return value
    .replace(/<+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function candidateLines(rows: string[]) {
  return rows
    .map((row) => normalizeLine(row))
    .filter((line) => line.length >= 26)
}

export function parseTaiwanPermitMrz(
  rows: string[],
): ParsedTaiwanPermitMrz | null {
  const candidates = candidateLines(rows)

  const line1 = candidates.find(
    (line) =>
      line.length === 30 &&
      (
        line.startsWith('CT') ||
        /^C[T7]/.test(line)
      ),
  )

  if (!line1) return null

  const line1Index = candidates.indexOf(line1)
  const following = candidates.slice(
    line1Index + 1,
  )

  const line2 = following.find(
    (line) =>
      line.length === 30 &&
      /^[A-P<]{8,}/.test(line),
  )

  const line3 = following.find(
    (line) =>
      line.length === 30 &&
      line !== line2 &&
      /^[A-Z<]{8,}/.test(line),
  )

  if (!line2 || !line3) return null

  const normalizedLine1 =
    line1.startsWith('C7')
      ? `CT${line1.slice(2)}`
      : line1

  const permitNumber =
    normalizedLine1.slice(2, 10)
  const issueCount =
    normalizedLine1.slice(12, 14)
  const expiryRaw =
    normalizedLine1.slice(15, 21)
  const sexRaw =
    normalizedLine1[22]
  const birthRaw =
    normalizedLine1.slice(23, 29)

  const permitNumberCheck = validateCheckDigit(
    normalizedLine1.slice(2, 11),
    normalizedLine1[11],
  )

  const issueCountCheck = validateCheckDigit(
    issueCount,
    normalizedLine1[14],
  )

  const expiryCheck = validateCheckDigit(
    expiryRaw,
    normalizedLine1[21],
  )

  const birthCheck = validateCheckDigit(
    birthRaw,
    normalizedLine1[29],
  )

  const compositeValue =
    normalizedLine1.slice(2, 22) +
    normalizedLine1.slice(23, 30) +
    line2.slice(19, 29)

  const compositeCheck = validateCheckDigit(
    compositeValue,
    line2[29],
  )

  const validation: TaiwanPermitMrzValidation = {
    permitNumber: permitNumberCheck,
    issueCount: issueCountCheck,
    expiryDate: expiryCheck,
    birthDate: birthCheck,
    composite: compositeCheck,
    requiredValid:
      permitNumberCheck === true &&
      expiryCheck === true &&
      birthCheck === true &&
      compositeCheck === true,
  }

  const birthCentury =
    centuryFromCode(line2[18])

  return {
    line1: normalizedLine1,
    line2,
    line3,
    permitNumber:
      /^\d{8}$/.test(permitNumber)
        ? permitNumber
        : '',
    issueCount:
      /^\d{2}$/.test(issueCount)
        ? issueCount
        : '',
    expiryDate: normalizeDate(
      expiryRaw,
      null,
      'expiry',
    ),
    birthDate: normalizeDate(
      birthRaw,
      birthCentury,
      'birth',
    ),
    sex:
      sexRaw === 'M' || sexRaw === 'F'
        ? sexRaw
        : '',
    chineseName: decodeChineseName(
      line2.slice(0, 16),
    ),
    latinName: cleanLatinName(
      line3.slice(0, 26),
    ),
    validation,
  }
}
