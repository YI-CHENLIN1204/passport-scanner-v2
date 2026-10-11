export type PermitStandaloneSex = '' | 'M' | 'F'

export interface PermitStandaloneSexEvidence {
  value: PermitStandaloneSex
  tokenCount: number
  conflicting: boolean
}

function standaloneSexValue(text: string): PermitStandaloneSex {
  const compact = text
    .trim()
    .toUpperCase()

  if (compact === '男' || compact === 'M') return 'M'
  if (compact === '女' || compact === 'F') return 'F'
  return ''
}

export function collectStandalonePermitSexEvidence(
  texts: readonly string[],
): PermitStandaloneSexEvidence {
  const values = texts
    .map(standaloneSexValue)
    .filter(
      (value): value is 'M' | 'F' =>
        value === 'M' || value === 'F',
    )

  const distinct = [...new Set(values)]

  return {
    value:
      distinct.length === 1
        ? distinct[0]
        : '',
    tokenCount: values.length,
    conflicting: distinct.length > 1,
  }
}
