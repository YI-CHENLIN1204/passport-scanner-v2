export interface PermitLatinName {
  surname: string
  givenNames: string
}

const permitEnglishStopWords = new Set([
  'TAIWAN',
  'RESIDENT',
  'MAINLAND',
  'TRAVEL',
  'PERMIT',
  'HOLDER',
  'PEOPLES',
  'REPUBLIC',
  'CHINA',
  'NAME',
  'SEX',
  'DATE',
  'BIRTH',
  'VALID',
  'EXPIRY',
  'AUTHORITY',
  'ISSUE',
  'NUMBER',
])

export function extractPermitLatinName(
  text: string,
): PermitLatinName | null {
  let upper = text
    .toUpperCase()
    .replace(/[0-9]/g, ' ')
    .replace(/[^A-Z,- ]/g, ' ')
    .replace(/s+/g, ' ')
    .trim()

  // Taiwan permit OCR commonly groups the printed "Name" label and the
  // romanized name into one row. "NAME LIN YI CHEN" is valid name evidence;
  // remove only a leading label, while NAME elsewhere remains a stop word.
  upper = upper
    .replace(/^NAME(?:\s+|[,\-]+)+/, '')
    .trim()

  if (!upper || upper.length < 5 || upper.length > 45) {
    return null
  }

  const tokens = upper
    .replace(/,/g, ' ')
    .split(/[\s\-]+/)
    .filter(Boolean)

  if (tokens.length < 2 || tokens.length > 5) {
    return null
  }

  if (
    tokens.some(token =>
      permitEnglishStopWords.has(token),
    )
  ) {
    return null
  }

  if (!tokens.every(token => token.length >= 2)) {
    return null
  }

  const commaIndex = upper.indexOf(',')

  if (commaIndex >= 0) {
    const surname = upper
      .slice(0, commaIndex)
      .replace(/[^A-Z]/g, '')
    const givenNames = upper
      .slice(commaIndex + 1)
      .replace(/[^A-Z\- ]/g, '')
      .trim()

    return surname && givenNames
      ? { surname, givenNames }
      : null
  }

  return {
    surname: tokens[0],
    givenNames: tokens.slice(1).join(' '),
  }
}
