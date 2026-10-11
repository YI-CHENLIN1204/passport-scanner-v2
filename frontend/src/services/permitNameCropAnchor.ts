export interface PermitCropAnchor {
  text: string
  score: number | null
}
export function choosePermitNameCropAnchor<T extends PermitCropAnchor>(
  geometries: readonly T[],
  latinName: (text: string) => boolean,
): T | null {
  const ranked = (predicate: (item: T) => boolean) =>
    geometries.filter(predicate)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0]
  // Chinese printed field label outranks English regardless of score.
  const chinese = ranked(item => item.text.replace(/\s+/g, '').includes('姓名'))
  if (chinese) return chinese
  const english = ranked(item => /name/i.test(item.text.replace(/\s+/g, '')))
  if (english) return english
  return ranked(item => latinName(item.text)) ?? null
}
