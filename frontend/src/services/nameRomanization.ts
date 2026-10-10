import { pinyin } from 'pinyin-pro'
import { officialTaiwanSyllableAliases } from './officialRomanizationVariants'

export type RomanizationCompatibility =
  | 'compatible'
  | 'conflict'
  | 'unknown'

function normalizeLatinToken(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[^A-Za-z]/g, '')
    .toLowerCase()
}

function splitMrzNameTokens(
  surname: string,
  givenNames: string,
) {
  return [surname, givenNames]
    .flatMap((part) =>
      part
        .split(/[\s,.'-]+/)
        .map(normalizeLatinToken)
        .filter(Boolean),
    )
}

function addCommonTaiwanAliases(
  syllable: string,
  aliases: Set<string>,
) {
  const s = syllable

  if (s.startsWith('x')) {
    aliases.add(`hs${s.slice(1)}`)
  }

  if (s.startsWith('zh')) {
    aliases.add(`ch${s.slice(2)}`)
  }

  if (s.startsWith('j')) {
    aliases.add(`ch${s.slice(1)}`)
  }

  if (s.startsWith('q')) {
    aliases.add(`ch${s.slice(1)}`)
  }

  if (s.startsWith('g')) {
    aliases.add(`k${s.slice(1)}`)
  }

  if (s.startsWith('z')) {
    aliases.add(`ts${s.slice(1)}`)
  }

  if (s.startsWith('c')) {
    aliases.add(`ts${s.slice(1)}`)
  }

  if (s === 'si') aliases.add('ssu')
  if (s === 'zi') aliases.add('tzu')

  // Common Wade-Giles / legacy Taiwan passport spellings.
  const explicit: Record<string, string[]> = {
    xia: ['hsia'],
    xiao: ['hsiao'],
    xie: ['hsieh'],
    xiu: ['hsiu'],
    xu: ['hsu'],
    xuan: ['hsuan'],
    jie: ['chieh'],
    jia: ['chia'],
    jing: ['ching'],
    zhi: ['chih'],
    zhang: ['chang'],
    gui: ['kuei'],
    kui: ['kuei'],
    guo: ['kuo'],
    zong: ['tsung'],
    cong: ['tsung'],
  }

  for (const alias of explicit[s] ?? []) {
    aliases.add(alias)
  }

  // Final variants seen in legacy romanization.
  for (const value of [...aliases]) {
    if (value.endsWith('ie')) {
      aliases.add(`${value}h`)
    }

    if (value.endsWith('ui')) {
      aliases.add(
        `${value.slice(0, -2)}uei`,
      )
    }
  }
}

function romanizationTokenMatchesAlias(
  token: string,
  alias: string,
) {
  if (token === alias) return true

  if (token.length !== alias.length) {
    return false
  }

  let mismatches = 0

  for (let index = 0; index < token.length; index += 1) {
    if (token[index] === alias[index]) continue

    const pair =
      token[index] + alias[index]

    // OCR commonly confuses capital I and lower-case-looking L in passport /
    // permit romanized names. Keep the tolerance intentionally narrow:
    // one character only, and only this visually similar pair.
    if (pair !== 'il' && pair !== 'li') {
      return false
    }

    mismatches += 1

    if (mismatches > 1) return false
  }

  return mismatches === 1
}

function pinyinAliasesForCharacter(
  character: string,
  includeOfficialVariants = false,
) {
  const readings = pinyin(character, {
    type: 'array',
    toneType: 'none',
    multiple: true,
    traditional: true,
  })

  const aliases = new Set<string>()

  for (const reading of readings) {
    const normalized = normalizeLatinToken(reading)
    if (!normalized) continue

    aliases.add(normalized)
    addCommonTaiwanAliases(normalized, aliases)
    if (includeOfficialVariants) {
      for (const variant of officialTaiwanSyllableAliases(normalized)) {
        aliases.add(variant)
      }
    }
  }

  return aliases
}

function compareWithVariantMode(
  chineseName: string,
  surname: string,
  givenNames: string,
  useOfficialVariants: boolean,
): RomanizationCompatibility {
  const compactChinese = chineseName
    .replace(/[\s·‧]/g, '')
    .trim()

  if (
    !compactChinese ||
    !/^[\p{Script=Han}]+$/u.test(compactChinese)
  ) {
    return 'unknown'
  }

  const characters = Array.from(compactChinese)
  const mrzTokens = splitMrzNameTokens(
    surname,
    givenNames,
  )

  if (!mrzTokens.length) return 'unknown'

  // A different number of Han characters and romanized syllables is a
  // strong warning for ordinary Taiwan Chinese names. We do not try to
  // "fix" the OCR result; we simply refuse to auto-fill it.
  if (characters.length !== mrzTokens.length) {
    return 'conflict'
  }

  let matched = 0

  for (let index = 0; index < characters.length; index += 1) {
    const aliases = pinyinAliasesForCharacter(
      characters[index], useOfficialVariants,
    )
    const token = mrzTokens[index]

    if (
      [...aliases].some((alias) =>
        romanizationTokenMatchesAlias(
          token,
          alias,
        ),
      )
    ) {
      matched += 1
    }
  }

  if (matched === characters.length) {
    return 'compatible'
  }

  // If most syllables line up but one character disagrees, the English MRZ
  // provides strong evidence of an OCR character error, e.g.
  // 林海注 (LIN HAI ZHU) vs LIN HAI SHENG.
  if (
    matched >= Math.max(1, characters.length - 1)
  ) {
    return 'conflict'
  }

  // Legacy Taiwan romanization can vary substantially. When too little of
  // the name can be aligned, do not claim the Chinese OCR is wrong; just
  // withhold phonetic approval and require manual entry/confirmation.
  return 'unknown'
}

// Production comparator intentionally retains its original behavior.
export function compareChineseNameToMrzRomanization(
  chineseName: string,
  surname: string,
  givenNames: string,
): RomanizationCompatibility {
  return compareWithVariantMode(
    chineseName, surname, givenNames, false,
  )
}

/** Shadow-only candidate: accept exact BOCA alternative spellings.
 * Does not relax the one-mismatch conflict rule or auto-write identity data.
 */
export function compareChineseNameToMrzWithOfficialVariants(
  chineseName: string,
  surname: string,
  givenNames: string,
): RomanizationCompatibility {
  return compareWithVariantMode(
    chineseName, surname, givenNames, true,
  )
}

/** Read-only diagnostic for a conflict already reported by the production comparator.
 * Never returns names, MRZ tokens or any other personally identifying content.
 */
export function classifyRomanizationConflict(
  chineseName: string,
  surname: string,
  givenNames: string,
): 'token-count-mismatch' | 'one-syllable-mismatch' | 'other-mismatch' | 'unclassified' {
  if (
    compareChineseNameToMrzRomanization(
      chineseName, surname, givenNames,
    ) !== 'conflict'
  ) return 'unclassified'

  const compact = chineseName.replace(/[\s·‧]/g, '').trim()
  const characters = Array.from(compact)
  const tokens = splitMrzNameTokens(surname, givenNames)
  if (characters.length !== tokens.length) {
    return 'token-count-mismatch'
  }
  let mismatches = 0
  for (let index = 0; index < characters.length; index += 1) {
    const aliases = pinyinAliasesForCharacter(characters[index])
    if (![...aliases].some(alias =>
      romanizationTokenMatchesAlias(tokens[index] ?? '', alias),
    )) mismatches += 1
  }
  return mismatches === 1
    ? 'one-syllable-mismatch'
    : 'other-mismatch'
}
