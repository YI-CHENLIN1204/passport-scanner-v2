export type TaiwanCompatriotPermitSex = '' | 'M' | 'F' | 'X'

export interface TaiwanCompatriotPermitReviewForm {
  chineseName: string
  permitNumber: string
  birthDate: string
  sex: TaiwanCompatriotPermitSex
  expiryDate: string
}

export interface TaiwanCompatriotPermitReviewDraft {
  schemaVersion: 1
  documentType: 'taiwan-compatriot-permit'
  chineseName: string
  permitNumber: string
  birthDate: string
  sex: TaiwanCompatriotPermitSex
  expiryDate: string
  reviewAssertions: {
    allFieldsVisuallyConfirmed: boolean
  }
  ocr: {
    engine: 'paddleocr-ppocrv5'
    extractedFieldCount: number
    averageScore: number | null
  }
  reviewedAt: string
}
