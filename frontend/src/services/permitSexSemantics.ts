export type PermitSemanticSex = '' | 'M' | 'F' | 'X'

export function extractPermitSemanticSexFromRows(
  rows: readonly string[],
): PermitSemanticSex {
  for (const row of rows) {
    const compact = row
      .replace(/\s+/g, '')
      .toUpperCase()

    if (
      /女(?:性别|性別)/.test(compact) ||
      /(?:性别|性別)[:：]?女/.test(compact) ||
      /(?:SEX)[:：]?F(?:$|[^A-Z])/.test(compact)
    ) {
      return 'F'
    }

    if (
      /男(?:性别|性別)/.test(compact) ||
      /(?:性别|性別)[:：]?男/.test(compact) ||
      /(?:SEX)[:：]?M(?:$|[^A-Z])/.test(compact)
    ) {
      return 'M'
    }
  }

  return ''
}
