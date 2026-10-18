import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const service = readFileSync(
  'src/services/passportChineseNameReviewCandidate.ts',
  'utf8',
)
const batch = readFileSync('src/views/BatchScanPage.vue', 'utf8')
const v6 = readFileSync('src/services/passportV6ChineseNameReviewCandidate.ts', 'utf8')
const paddle = readFileSync('src/services/paddleOcr.ts', 'utf8')
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
assert.match(service, /convertSimplifiedNameToTraditional/)
assert.match(service, /ambiguousCharacters\.length === 0/)
assert.match(batch, /nameZh: normalizedPassportChineseName/)
assert.match(batch, /nameZhOnDocument: rawPassportChineseName/)
assert.match(batch, /passportNameScript:/)
assert.match(batch, /originalFields: \{[\s\S]*?nameZh: result\.chineseName \?\? ''/)

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
assert.match(passport, /suggestPassportV6NameForReview/)
assert.match(v6, /ocrVersion: 'PP-OCRv6'/)
assert.match(v6, /createPassportLowerPageNameProbeImage/)
assert.match(v6, /if \(evidence\.compatibleCandidates\.length === 0\)/)
assert.match(v6, /if \\(retry\\.compatibleCandidates\\.length > 0\\)/)
assert.match(batch, /suggestPassportV6NameForReview/)
assert.match(paddle, /height < width \* 1\.2/)
assert.match(v6, /textDetectionModelName: 'PP-OCRv6_small_det'/)
assert.match(v6, /textRecognitionModelName: 'PP-OCRv6_small_rec'/)
assert.match(v6, /compareChineseNameToMrzRomanization/)
assert.match(v6, /compatibleCandidates.length === 1/)
assert.match(docker, /PP-OCRv6_small_rec_onnx_infer.tar/)
assert.match(docker, /PP-OCRv6_small_det_onnx_infer.tar/)
assert.match(passport, /secondaryChineseNameReview/)
assert.doesNotMatch(
  passport,
  /result\.chineseName\s*=\s*(?:suggestion|secondary)/,
)
assert.ok(
  !nonPassport.includes('suggestPassportV6NameForReview('),
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
assert.match(tour, /const passportReviewName =/)
assert.match(tour, /document\.documentType === 'PASSPORT' &&/)
assert.match(tour, /document\.reviewStatus === 'PENDING'/)
assert.match(tour, /: passportReviewName,/)
assert.match(tour, /replaceAll\('温', '溫'\)/)
assert.match(tour, /人工套用候選/)
assert.match(service, /ambiguousScriptCount/)
assert.match(service, /scriptConvertedCount/)
assert.match(service, /rawHanLineCount/)
assert.match(batch, /secondaryChineseNameReview\.ambiguousScriptCount/)
assert.match(contracts, /ChineseNameReviewStageCounts/)
assert.match(api, /chineseNameReviewStageCounts/)
assert.match(store, /ExtractChineseNameReviewStageCounts\(item\.OcrPayloadJson\)/)
assert.match(tour, /第二模型匿名階段計數/)
assert.doesNotMatch(service, /console\.log\(candidates/)
assert.match(api, /chineseNameReviewStatus:/)
assert.match(contracts, /string\? ChineseNameReviewStatus/)
assert.match(store, /ExtractChineseNameReviewStatus\(item\.OcrPayloadJson\)/)
assert.match(tour, /第二模型無法完成載入或辨識/)
assert.match(tour, /此筆沒有第二模型執行紀錄/)
assert.match(tour, /這筆掃描未觸發第二模型/)
assert.match(store, /"legacy-no-record"/)
assert.match(store, /"not-attempted"/)
assert.match(tour, /第二模型找到多個相容姓名/)
assert.match(tour, /第二模型未取得唯一且符合 MRZ 的姓名/)
assert.match(
  tour,
  /reviewForm\.nameZh\s*=\s*currentDocument\.chineseNameReviewCandidate/,
)

console.log(
  'Passport secondary recognizer remains MRZ-gated and review-only',
)

// D-116: saving without "next" must not silently rebind the open modal
// to another traveler group after name-based draft-person regrouping.
const saveStart = tour.indexOf('async function saveReview(moveNext: boolean)')
const saveEnd = tour.indexOf('function handleKeydown(', saveStart)
assert.ok(saveStart >= 0 && saveEnd > saveStart)
const saveFlow = tour.slice(saveStart, saveEnd)
assert.match(saveFlow, /await reviewScanItem\(/)
assert.match(saveFlow, /await reloadQueue\(\)/)
assert.match(saveFlow, /if \(moveNext\)/)
assert.match(saveFlow, /openReview\(next\)/)
assert.match(saveFlow, /reviewPerson\.value = null/)
assert.doesNotMatch(saveFlow, /reviewPerson\.value = updatedParent/)
assert.doesNotMatch(saveFlow, /reviewDocumentIndex\.value =\s*Math\.max\(0, updatedIndex\)/)

// D-117 multiple uploads display chronological versions, not ambiguous tabs.
assert.match(tour, /function documentVersionLabel\(/)
assert.match(tour, /createdAt\.localeCompare\(b\.createdAt\)/)
assert.match(tour, /第\{\{ documentVersionLabel\(document\)\.ordinal \}\}版/)
assert.match(tour, /最新掃描/)
assert.match(tour, /不代表最新核發或目前有效的證件/)

// D-120: protect exact label-prefix extraction and unchanged production selector.
assert.match(v6, /extractPassportV6ReviewCandidates/)
assert.match(paddle, /export function extractPassportV6ReviewCandidates/)
assert.match(paddle, /\(\?:姓名\|中文姓名\)/)
assert.match(paddle, /prefixedNames\.filter\(isPlausibleTaiwanChineseName\)/)
assert.match(paddle, /extractPassportChineseNameCandidatesForProbe\(prediction\)/)
assert.doesNotMatch(v6, /result\.chineseName\s*=/)


// D-122: an optional lower-page retry cannot erase first-pass evidence.
assert.match(v6, /candidateSource: 'broad-viz' \| 'lower-page'/)
assert.match(v6, /candidateSource = 'lower-page'/)
assert.match(v6, /if \(retry\.compatibleCandidates\.length > 0\)/)
assert.match(v6, /catch \{[\s\S]*?Keep first-pass evidence/)
assert.match(batch, /secondaryChineseNameReview\.candidateSource =/)
assert.doesNotMatch(v6, /result\.chineseName\s*=/)

// D-125 browser candidate evaluation must use real production MRZ, not truth for gating.
const quality = readFileSync('src/views/OcrQualityPage.vue', 'utf8')
assert.match(quality, /async function evaluateBrowserV6Validation/)
assert.match(quality, /suggestPassportV6NameForReview\(/)
assert.match(quality, /mrz\.surname, mrz\.givenNames/)
assert.match(quality, /v6Wrong\+\+/)
assert.match(quality, /samples\.length !== 19/)

// D-126: count compatible-gated misses without changing production activation.
assert.match(quality, /skippedCompatibleWrong\+\+/)
assert.match(quality, /shadowCorrect\+\+/)
assert.match(quality, /shadowWrong\+\+/)
assert.match(quality, /shadowAmbiguous\+\+/)
assert.match(quality, /shadow 結果不會套用/)

// D-127 truth-blind activation, private aggregate cross-tab only.
assert.match(quality, /const shadowBucket = primaryName === truth \? shadowOnCorrect : shadowOnWrong/)
assert.match(quality, /shadowBucket\.wrong\+\+/)
assert.match(quality, /Shadow × 主模型錯誤/)
assert.match(quality, /Shadow × 主模型正確/)

// D-128 bounded contrast branch is review-only and never modifies primary OCR.
assert.match(v6, /normalizePassportNameRoiLuminance/)
assert.match(v6, /normalizedResult\.compatibleCandidates\.length > 0/)
assert.match(v6, /candidateSource = 'contrast-review'/)
assert.match(v6, /Math\.min\(1\.4, 210 \/ \(high - low\)\)/)
assert.doesNotMatch(v6, /result\.chineseName\s*=/)

// D-129: attribution of actual browser candidate sources, without changing
// the production trigger or score denominator.
assert.match(quality, /v6Sources\[candidate\.candidateSource\]\.correct\+\+/)
assert.match(quality, /v6Sources\[candidate\.candidateSource\]\.wrong\+\+/)
assert.match(quality, /D-128 對比補救正確/)
assert.match(v6, /async function normalizePassportNameRoiLuminance/)
assert.doesNotMatch(v6, /export async function normalizePassportNameRoiLuminance/)
