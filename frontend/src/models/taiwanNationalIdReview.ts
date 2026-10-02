export type TaiwanNationalIdSex = '' | 'M' | 'F'

export interface TaiwanNationalIdReviewForm {
  chineseName: string
  nationalId: string
  birthDate: string
  sex: TaiwanNationalIdSex
}

export interface TaiwanNationalIdReviewDraft {
  schemaVersion: 1
  documentType: 'tw-id'
  chineseName: string
  nationalId: string
  birthDate: string
  sex: TaiwanNationalIdSex
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
