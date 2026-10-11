// Validation-only, ephemeral comparison of ground truth to selected raw OCR rows.
// Never expose or store identity text in a diagnostic result.
export type PermitNameRawFailureBucket =
  | 'exact-raw-row'
  | 'embedded-in-raw-row'
  | 'not-in-selected-raw-rows'

function compact(value: string): string {
  return value.replace(/\s+/g, '')
    .replace(/[，,。．.：:；;()（）\[\]【】]/g, '')
    .trim()
}

export function classifyPermitNameRawFailure(
  selected: string | null | undefined,
  expected: string | null | undefined,
  selectedRawRows: readonly string[],
): PermitNameRawFailureBucket | null {
  const target = compact(expected ?? '')
  if (!target || compact(selected ?? '') === target) return null
  const rows = selectedRawRows.map(compact)
  if (rows.includes(target)) return 'exact-raw-row'
  if (rows.some(row => row.includes(target))) return 'embedded-in-raw-row'
  return 'not-in-selected-raw-rows'
}
