import {
  compareChineseNameToMrzRomanization,
  compareChineseNameToMrzWithOfficialVariants,
  classifyRomanizationConflict,
} from './nameRomanization'
import type { PermitRawNameCompatibility } from './permitRawNameEvidence'

export interface PermitLatinNameAnchor {
  surname: string
  givenNames: string
  distance: number
}

export interface PermitRawRomanizationResolution {
  compatibility: PermitRawNameCompatibility
  latinDistance: number | null
  officialVariantPromotion: boolean
  conflictSubtype:
    | 'token-count-mismatch'
    | 'one-syllable-mismatch'
    | 'other-mismatch'
    | 'unclassified'
    | null
}

export function resolvePermitRawRomanization(
  value: string,
  anchors: readonly PermitLatinNameAnchor[],
): PermitRawRomanizationResolution {
  if (!anchors.length) {
    return {
      compatibility: 'unknown',
      latinDistance: null,
      officialVariantPromotion: false,
      conflictSubtype: null,
    }
  }

  let standardCompatibleDistance: number | null = null
  let officialCompatibleDistance: number | null = null
  let unknownDistance: number | null = null

  for (const anchor of anchors) {
    const standard = compareChineseNameToMrzRomanization(
      value,
      anchor.surname,
      anchor.givenNames,
    )

    if (standard === 'compatible') {
      standardCompatibleDistance =
        standardCompatibleDistance === null
          ? anchor.distance
          : Math.min(standardCompatibleDistance, anchor.distance)
      continue
    }

    if (
      standard === 'conflict' &&
      compareChineseNameToMrzWithOfficialVariants(
        value,
        anchor.surname,
        anchor.givenNames,
      ) === 'compatible'
    ) {
      officialCompatibleDistance =
        officialCompatibleDistance === null
          ? anchor.distance
          : Math.min(officialCompatibleDistance, anchor.distance)
      continue
    }

    if (standard === 'unknown') {
      unknownDistance =
        unknownDistance === null
          ? anchor.distance
          : Math.min(unknownDistance, anchor.distance)
    }
  }

  if (standardCompatibleDistance !== null) {
    return {
      compatibility: 'compatible',
      latinDistance: standardCompatibleDistance,
      officialVariantPromotion: false,
      conflictSubtype: null,
    }
  }

  if (officialCompatibleDistance !== null) {
    return {
      compatibility: 'compatible',
      latinDistance: officialCompatibleDistance,
      officialVariantPromotion: true,
      conflictSubtype: null,
    }
  }

  if (unknownDistance !== null) {
    return {
      compatibility: 'unknown',
      latinDistance: unknownDistance,
      officialVariantPromotion: false,
      conflictSubtype: null,
    }
  }

  const nearest = [...anchors]
    .sort((a, b) => a.distance - b.distance)[0]

  return {
    compatibility: 'conflict',
    latinDistance: nearest?.distance ?? null,
    officialVariantPromotion: false,
    conflictSubtype: nearest
      ? classifyRomanizationConflict(
          value,
          nearest.surname,
          nearest.givenNames,
        )
      : null,
  }
}
