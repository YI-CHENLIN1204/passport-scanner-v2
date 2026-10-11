export type PermitSexDiagnosticValue = '' | 'M' | 'F' | 'X'

export type PermitSexDiagnosticSource =
  | 'visual-agreement'
  | 'semantic-row'
  | 'mrz'
  | 'label'
  | 'semantic'
  | 'standalone-token'
  | 'empty'

export interface PermitSexEvidenceLike {
  mrzSex: PermitSexDiagnosticValue
  mrzRequiredValid: boolean
  labeledSex: PermitSexDiagnosticValue
  labeledScore: number | null
  semanticSex: PermitSexDiagnosticValue
  standaloneSex: PermitSexDiagnosticValue
  standaloneTokenCount: number
  standaloneTokenConflict: boolean
  selectedSource: PermitSexDiagnosticSource
}

export function aggregatePermitSexEvidence(
  rows: readonly (PermitSexEvidenceLike | null)[],
) {
  return {
    samplesWithMrzSex:
      rows.filter(row => Boolean(row?.mrzSex)).length,
    samplesWithLabeledSex:
      rows.filter(row => Boolean(row?.labeledSex)).length,
    samplesWithSemanticSex:
      rows.filter(row => Boolean(row?.semanticSex)).length,
    samplesWithStandaloneSexToken:
      rows.filter(row => Boolean(row?.standaloneSex)).length,
    samplesWithStandaloneTokenConflict:
      rows.filter(row => row?.standaloneTokenConflict === true).length,
    mrzSemanticConflict:
      rows.filter(row =>
        Boolean(
          row?.mrzSex &&
          row.semanticSex &&
          row.mrzSex !== row.semanticSex
        ),
      ).length,
    requiredValidMrzSemanticConflict:
      rows.filter(row =>
        Boolean(
          row?.mrzRequiredValid &&
          row.mrzSex &&
          row.semanticSex &&
          row.mrzSex !== row.semanticSex
        ),
      ).length,
    selectedVisualAgreement:
      rows.filter(row => row?.selectedSource === 'visual-agreement').length,
    selectedSemanticRow:
      rows.filter(row => row?.selectedSource === 'semantic-row').length,
    selectedMrz:
      rows.filter(row => row?.selectedSource === 'mrz').length,
    selectedLabel:
      rows.filter(row => row?.selectedSource === 'label').length,
    selectedSemantic:
      rows.filter(row => row?.selectedSource === 'semantic').length,
    selectedStandaloneToken:
      rows.filter(row => row?.selectedSource === 'standalone-token').length,
    selectedEmpty:
      rows.filter(row => row?.selectedSource === 'empty').length,
  }
}
