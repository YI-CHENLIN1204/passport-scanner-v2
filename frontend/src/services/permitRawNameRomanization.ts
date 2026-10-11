import {
  compareChineseNameToMrzRomanization,
  compareChineseNameToMrzWithOfficialVariants,
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
    }
  }

  if (officialCompatibleDistance !== null) {
    return {
      compatibility: 'compatible',
      latinDistance: officialCompatibleDistance,
      officialVariantPromotion: true,
    }
  }

  if (unknownDistance !== null) {
    return {
      compatibility: 'unknown',
      latinDistance: unknownDistance,
      officialVariantPromotion: false,
    }
  }

  return {
    compatibility: 'conflict',
    latinDistance: Math.min(
      ...anchors.map(anchor => anchor.distance),
    ),
    officialVariantPromotion: false,
  }
}
