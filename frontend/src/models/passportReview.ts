export type PassportSex = '' | 'M' | 'F' | 'X'

export interface PassportReviewForm {
  englishName: string
  passportNumber: string
  nationality: string
  issuingState: string
  birthDate: string
  sex: PassportSex
  expiryDate: string
}

export interface PassportReviewVerification {
  passportNumberCheckDigit: boolean | null
  birthDateCheckDigit: boolean | null
  expiryDateCheckDigit: boolean | null
  compositeCheckDigit: boolean | null
}

export interface PassportReviewAssertions {
  englishNameVisuallyConfirmed: boolean
}

export interface PassportReviewOcrMetadata {
  engine: 'paddleocr-ppocrv5'
  line2Validated: boolean
  fallbackUsed: boolean
  averageScore: number | null
}

export interface PassportReviewDraft {
  schemaVersion: 1
  documentType: 'passport'
  englishName: string
  passportNumber: string
  nationality: string
  issuingState: string
  birthDate: string
  sex: PassportSex
  expiryDate: string
  verification: PassportReviewVerification
  reviewAssertions: PassportReviewAssertions
  ocr: PassportReviewOcrMetadata
  reviewedAt: string
}
