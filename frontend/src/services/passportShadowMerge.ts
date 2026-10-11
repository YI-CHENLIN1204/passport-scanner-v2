/**
 * Simulate the final passport name decision without changing production data.
 * Existing accepted OCR output is always protected. Multiple distinct
 * suggestions from different crops are ambiguous, never first-wins.
 */
export function mergePassportStrictShadow(
  acceptedName: string | null | undefined,
  cropSuggestions: readonly (string | null | undefined)[],
): { value: string | null; reason: 'accepted' | 'unique' | 'ambiguous' | 'none' } {
  if (acceptedName) return { value: null, reason: 'accepted' }
  const names = [...new Set(cropSuggestions.filter(
    (name): name is string => Boolean(name),
  ))]
  if (names.length > 1) return { value: null, reason: 'ambiguous' }
  if (names.length === 1) return { value: names[0], reason: 'unique' }
  return { value: null, reason: 'none' }
}
