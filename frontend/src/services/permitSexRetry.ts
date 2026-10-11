export type PermitSexRetrySex = '' | 'M' | 'F'
export type PermitSexRetryRegionSource = 'label' | 'fixed'

export interface PermitSexRetryGeometry {
  text: string
  score: number | null
  minX: number
  maxX: number
  minY: number
  maxY: number
  height: number
}

export interface PermitSexRetryRegion {
  x: number
  y: number
  width: number
  height: number
  source: PermitSexRetryRegionSource
}

export interface PermitSexRetryEvidence {
  value: PermitSexRetrySex
  candidateCount: number
  conflicting: boolean
}

function isPermitSexLabel(text: string) {
  const compact = text
    .replace(/\s+/g, '')
    .toUpperCase()

  return (
    compact.includes('性別') ||
    compact.includes('性别') ||
    /^SEX(?:[:：]?[MF])?$/.test(compact)
  )
}

function sexLabelPriority(text: string) {
  const compact = text.replace(/\s+/g, '')
  if (compact.includes('性別') || compact.includes('性别')) {
    return 2
  }
  return /^SEX/i.test(compact) ? 1 : 0
}

function boundedRegion(
  imageWidth: number,
  imageHeight: number,
  x: number,
  y: number,
  width: number,
  height: number,
  source: PermitSexRetryRegionSource,
): PermitSexRetryRegion | null {
  if (imageWidth <= 0 || imageHeight <= 0) return null

  const left = Math.max(
    0,
    Math.min(imageWidth - 1, Math.floor(x)),
  )
  const top = Math.max(
    0,
    Math.min(imageHeight - 1, Math.floor(y)),
  )
  const boundedWidth = Math.max(
    1,
    Math.min(imageWidth - left, Math.ceil(width)),
  )
  const boundedHeight = Math.max(
    1,
    Math.min(imageHeight - top, Math.ceil(height)),
  )

  return {
    x: left,
    y: top,
    width: boundedWidth,
    height: boundedHeight,
    source,
  }
}

export function selectPermitSexRetryRegion(
  imageWidth: number,
  imageHeight: number,
  geometries: readonly PermitSexRetryGeometry[],
): PermitSexRetryRegion | null {
  if (imageWidth <= 0 || imageHeight <= 0) return null

  const label = geometries
    .filter(item => isPermitSexLabel(item.text))
    .sort((a, b) =>
      sexLabelPriority(b.text) - sexLabelPriority(a.text) ||
      (b.score ?? 0) - (a.score ?? 0) ||
      a.minY - b.minY
    )[0]

  if (label) {
    const h = Math.max(8, label.height)
    const labelWidth = Math.max(1, label.maxX - label.minX)

    return boundedRegion(
      imageWidth,
      imageHeight,
      label.minX - h * 2,
      label.minY - h * 2,
      Math.max(
        labelWidth + h * 12,
        imageWidth * 0.30,
      ),
      Math.max(
        h * 6,
        imageHeight * 0.16,
      ),
      'label',
    )
  }

  // Fixed-layout fallback is intentionally limited to the center-right
  // front-side band where Sex/性別 is printed. It is only used when no
  // Sex/性別 label geometry was detected and never on a permit that
  // already has a final sex value.
  return boundedRegion(
    imageWidth,
    imageHeight,
    imageWidth * 0.30,
    imageHeight * 0.22,
    imageWidth * 0.48,
    imageHeight * 0.34,
    'fixed',
  )
}

function standaloneSexValue(
  text: string,
): PermitSexRetrySex {
  const compact = text
    .trim()
    .toUpperCase()

  if (compact === '男' || compact === 'M') return 'M'
  if (compact === '女' || compact === 'F') return 'F'
  return ''
}

function semanticSexValuesFromRow(
  row: string,
): Array<'M' | 'F'> {
  const compact = row
    .replace(/\s+/g, '')
    .toUpperCase()

  const values: Array<'M' | 'F'> = []

  if (
    /女(?:性别|性別)/.test(compact) ||
    /(?:性别|性別)[:：]?女/.test(compact) ||
    /SEX[:：]?F(?:$|[^A-Z])/.test(compact)
  ) {
    values.push('F')
  }

  if (
    /男(?:性别|性別)/.test(compact) ||
    /(?:性别|性別)[:：]?男/.test(compact) ||
    /SEX[:：]?M(?:$|[^A-Z])/.test(compact)
  ) {
    values.push('M')
  }

  return values
}

export function collectPermitSexRetryEvidence(
  rows: readonly string[],
  detectedTexts: readonly string[],
): PermitSexRetryEvidence {
  const values: Array<'M' | 'F'> = []

  for (const row of rows) {
    values.push(...semanticSexValuesFromRow(row))
  }

  for (const text of detectedTexts) {
    const value = standaloneSexValue(text)
    if (value) values.push(value)
  }

  const distinct = [...new Set(values)]
  const conflicting = distinct.length > 1

  return {
    value:
      !conflicting && distinct.length === 1
        ? distinct[0]
        : '',
    candidateCount: values.length,
    conflicting,
  }
}
