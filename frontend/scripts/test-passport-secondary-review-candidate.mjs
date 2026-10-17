import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const service = readFileSync(
  'src/services/passportChineseNameReviewCandidate.ts',
  'utf8',
)
const batch = readFileSync('src/views/BatchScanPage.vue', 'utf8')
const api = readFileSync('src/services/api.ts', 'utf8')
const tour = readFileSync('src/views/TourDetailPage.vue', 'utf8')
const contracts = readFileSync(
  '../backend/PassportScanner.Api/Contracts/ScanQueueContracts.cs',
  'utf8',
)
const store = readFileSync(
  '../backend/PassportScanner.Api/Persistence/PostgresScanQueueStore.cs',
  'utf8',
)
const docker = readFileSync('Dockerfile', 'utf8')

assert.match(docker, /chinese_cht_PP-OCRv3_rec_mobile\.onnx/)
assert.match(
  docker,
  /779656d044ce388045e02ea9244724616194e63928606436cdfc6dc3c9528cc6/,
)
assert.match(
  docker,
  /chinese_cht_PP-OCRv3_mobile_rec_rapidocr\.tar/,
)
assert.equal(
  docker.match(/FROM nginx:alpine AS final/g)?.length,
  1,
  'Dockerfile must contain one final stage only',
)
assert.match(
  docker,
  /grep -Eq '\^\[\[:space:\]\]\*model_name:\[\[:space:\]\]\*chinese_cht_PP-OCRv3_mobile_rec\[\[:space:\]\]\*\$'/,
)

assert.match(service, /worker: true/)
assert.match(service, /backend: 'wasm'/)
assert.match(
  service,
  /textDetectionModelName: 'PP-OCRv5_mobile_det'/,
)
assert.match(
  service,
  /textRecognitionModelName: recognitionModelName/,
)
assert.match(service, /compareChineseNameToMrzRomanization/)
assert.match(service, /=== 'compatible'/)
assert.match(service, /compatibleCandidates\.length === 1/)

const passportStart = batch.indexOf(
  'async function buildPassportItem(',
)
const permitStart = batch.indexOf(
  'async function buildPermitItem(',
  passportStart,
)
assert.ok(passportStart >= 0 && permitStart > passportStart)
const passport = batch.slice(passportStart, permitStart)
const nonPassport = batch.slice(permitStart)

assert.match(
  passport,
  /chineseNameRomanizationStatus !== 'compatible'/,
)
assert.match(passport, /suggestPassportChineseNameForReview/)
assert.match(passport, /secondaryChineseNameReview/)
assert.doesNotMatch(
  passport,
  /result\.chineseName\s*=\s*(?:suggestion|secondary)/,
)
assert.ok(
  !nonPassport.includes('suggestPassportChineseNameForReview('),
  'permit and ID flows must not invoke the passport second recognizer',
)

assert.match(
  api,
  /chineseNameReviewCandidate: string \| null/,
)
assert.match(contracts, /string\? ChineseNameReviewCandidate/)
const reviewedInputStart = store.indexOf(
  'private static ReviewedDocumentInput BuildReviewedDocumentInput(',
)
const reviewedInputEnd = store.indexOf(
  'private TourPersonDraftRecord ResolveDraftPerson(',
  reviewedInputStart,
)
const responseStart = store.indexOf(
  'private static ScanItemResponse ToItemResponse(',
)
const responseEnd = store.indexOf(
  'private static string? ExtractChineseNameReviewCandidate(',
  responseStart,
)
assert.ok(
  reviewedInputStart >= 0 && reviewedInputEnd > reviewedInputStart,
)
assert.ok(responseStart >= 0 && responseEnd > responseStart)
const reviewedInput = store.slice(reviewedInputStart, reviewedInputEnd)
const responseMapping = store.slice(responseStart, responseEnd)
assert.doesNotMatch(
  reviewedInput,
  /ExtractChineseNameReviewCandidate/,
)
assert.match(
  responseMapping,
  /ExtractChineseNameReviewCandidate\(item\.OcrPayloadJson\)/,
)
assert.match(store, /"secondaryChineseNameReview"/)
assert.match(tour, /第二模型人工覆核候選/)
assert.match(tour, /人工套用候選/)
assert.match(api, /chineseNameReviewStatus:/)
assert.match(contracts, /string\? ChineseNameReviewStatus/)
assert.match(store, /ExtractChineseNameReviewStatus\(item\.OcrPayloadJson\)/)
assert.match(tour, /第二模型無法完成載入或辨識/)
assert.match(tour, /第二模型找到多個相容姓名/)
assert.match(tour, /第二模型未取得唯一且符合 MRZ 的姓名/)
assert.match(
  tour,
  /reviewForm\.nameZh\s*=\s*currentDocument\.chineseNameReviewCandidate/,
)

console.log(
  'Passport secondary recognizer remains MRZ-gated and review-only',
)
