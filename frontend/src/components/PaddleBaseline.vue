<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  recognizePassportWithPaddle,
  recognizePassportsWithPaddle,
  type PaddleBaselineResult,
  type PaddleBatchProgress,
} from '../services/paddleOcr'
import type {
  PassportReviewDraft,
  PassportReviewForm,
} from '../models/passportReview'
import {
  savePassportReview,
  type PassportReviewSaveResponse,
} from '../services/api'

const props = defineProps<{
  file: File | null
}>()

const running = ref(false)
const error = ref('')
const result = ref<PaddleBaselineResult | null>(null)

const reviewForm = ref<PassportReviewForm>({
  englishName: '',
  passportNumber: '',
  nationality: '',
  issuingState: '',
  birthDate: '',
  sex: '',
  expiryDate: '',
})
const reviewConfirmed = ref(false)
const reviewImageUrl = ref('')
const reviewOriginal = ref<PassportReviewForm | null>(null)
const reviewedAt = ref<string | null>(null)
const reviewRef = ref<HTMLElement | null>(null)
const confirmedDraft = ref<PassportReviewDraft | null>(null)
const nameVisuallyConfirmed = ref(false)
const reviewSubmitting = ref(false)
const reviewSubmitError = ref('')
const reviewApiReceipt = ref<PassportReviewSaveResponse | null>(null)

interface PaddleBatchResult {
  index: number
  totalMs: number
  predictMs: number
  structureComplete: boolean
  line1Valid: boolean
  line2ChecksPassed: boolean
  averageScore: number | null
  correctedCharacters: number
  detectedBoxes: number | null
  recognizedCount: number | null
  fallbackUsed: boolean
  fallbackCropRatio: number | null
  error: string | null
}

const batchFiles = ref<File[]>([])
const batchError = ref('')
const batchRunning = ref(false)
const batchCurrent = ref(0)
const batchResults = ref<PaddleBatchResult[]>([])
const batchProgress = ref<PaddleBatchProgress>({
  completed: 0,
  total: 0,
  current: 0,
  stage: 'initializing',
  message: '',
})

const canRun = computed(() => props.file !== null && !running.value)

const canRunBatch = computed(
  () =>
    batchFiles.value.length >= 3 &&
    batchFiles.value.length <= 5 &&
    !batchRunning.value,
)

const batchProgressPercent = computed(() => {
  if (!batchProgress.value.total) return 0

  const base =
    (batchProgress.value.completed / batchProgress.value.total) * 100

  if (
    batchRunning.value &&
    batchProgress.value.current > batchProgress.value.completed
  ) {
    const segment = 100 / batchProgress.value.total
    return Math.min(99, base + segment * 0.35)
  }

  return Math.min(100, base)
})

const batchPassCount = computed(
  () =>
    batchResults.value.filter(
      (item) => item.structureComplete && item.line2ChecksPassed,
    ).length,
)

const reviewErrors = computed(() => {
  const errors: string[] = []
  const form = reviewForm.value

  if (!form.englishName.trim()) {
    errors.push('英文姓名不可空白。')
  } else if (!/^[A-Z][A-Z .,'-]*$/.test(form.englishName.trim())) {
    errors.push('英文姓名請使用英文字母與常見姓名符號。')
  }

  if (!/^[A-Z0-9]{5,20}$/.test(form.passportNumber.trim())) {
    errors.push('護照號碼格式不完整，請確認英數字內容。')
  }

  if (!/^[A-Z]{3}$/.test(form.nationality.trim())) {
    errors.push('國籍請使用 3 碼國家代碼。')
  }

  if (!/^[A-Z]{3}$/.test(form.issuingState.trim())) {
    errors.push('簽發國請使用 3 碼國家代碼。')
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.birthDate)) {
    errors.push('出生日期請使用 YYYY-MM-DD。')
  } else {
    const birth = new Date(`${form.birthDate}T00:00:00`)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (Number.isNaN(birth.getTime()) || birth > today) {
      errors.push('出生日期不合理，請重新確認。')
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.expiryDate)) {
    errors.push('有效期限請使用 YYYY-MM-DD。')
  }

  if (!['M', 'F', 'X', ''].includes(form.sex)) {
    errors.push('性別欄位格式不正確。')
  }

  return errors
})

const reviewWarnings = computed(() => {
  const warnings: string[] = []

  if (/^\d{4}-\d{2}-\d{2}$/.test(reviewForm.value.expiryDate)) {
    const expiry = new Date(`${reviewForm.value.expiryDate}T23:59:59`)
    if (!Number.isNaN(expiry.getTime()) && expiry < new Date()) {
      warnings.push('這本護照目前已過有效期限。')
    }
  }

  return warnings
})

const changedReviewFields = computed(() => {
  if (!reviewOriginal.value) return []

  const labels: Record<keyof PassportReviewForm, string> = {
    englishName: '英文姓名',
    passportNumber: '護照號碼',
    nationality: '國籍',
    issuingState: '簽發國',
    birthDate: '出生日期',
    sex: '性別',
    expiryDate: '有效期限',
  }

  return (Object.keys(labels) as Array<keyof PassportReviewForm>)
    .filter(
      (key) =>
        reviewForm.value[key] !== reviewOriginal.value?.[key],
    )
    .map((key) => labels[key])
})

const canConfirmReview = computed(
  () =>
    Boolean(result.value?.parsedMrz) &&
    reviewErrors.value.length === 0 &&
    nameVisuallyConfirmed.value,
)

const batchAveragePredictSeconds = computed(() => {
  const completed = batchResults.value.filter((item) => !item.error)
  if (!completed.length) return 0

  return (
    completed.reduce((sum, item) => sum + item.predictMs, 0) /
    completed.length /
    1000
  )
})

function revokeReviewImageUrl() {
  if (reviewImageUrl.value) {
    URL.revokeObjectURL(reviewImageUrl.value)
    reviewImageUrl.value = ''
  }
}

function resetReviewForm() {
  reviewForm.value = {
    englishName: '',
    passportNumber: '',
    nationality: '',
    issuingState: '',
    birthDate: '',
    sex: '',
    expiryDate: '',
  }
  reviewConfirmed.value = false
  nameVisuallyConfirmed.value = false
  reviewOriginal.value = null
  reviewedAt.value = null
  confirmedDraft.value = null
  reviewSubmitting.value = false
  reviewSubmitError.value = ''
  reviewApiReceipt.value = null
}

function formatIsoDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return ''
  }

  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-')
}

function mrzBirthDateToIso(value: string) {
  if (!/^\d{6}$/.test(value)) return ''

  const yy = Number(value.slice(0, 2))
  const month = Number(value.slice(2, 4))
  const day = Number(value.slice(4, 6))
  const currentYear = new Date().getFullYear()

  let year = 2000 + yy
  if (year > currentYear) {
    year -= 100
  }

  return formatIsoDate(year, month, day)
}

function mrzExpiryDateToIso(value: string) {
  if (!/^\d{6}$/.test(value)) return ''

  const yy = Number(value.slice(0, 2))
  const month = Number(value.slice(2, 4))
  const day = Number(value.slice(4, 6))
  const currentYear = new Date().getFullYear()
  const targetYear = currentYear + 5

  const candidates = [1900 + yy, 2000 + yy, 2100 + yy]
  const year = candidates.sort(
    (a, b) => Math.abs(a - targetYear) - Math.abs(b - targetYear),
  )[0]

  return formatIsoDate(year, month, day)
}

function normalizeReviewText(
  field: 'englishName' | 'passportNumber' | 'nationality' | 'issuingState',
) {
  reviewForm.value[field] = reviewForm.value[field]
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
}

function resetReviewToOcr() {
  if (!reviewOriginal.value) return
  reviewForm.value = { ...reviewOriginal.value }
  nameVisuallyConfirmed.value = false
  reviewConfirmed.value = false
  reviewedAt.value = null
  confirmedDraft.value = null
  reviewSubmitError.value = ''
  reviewApiReceipt.value = null
}

function formatReviewedAt(value: string | null) {
  if (!value) return ''

  const date = new Date(value)
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function populateReviewForm(ocrResult: PaddleBaselineResult) {
  const parsed = ocrResult.parsedMrz
  if (!parsed) {
    resetReviewForm()
    return
  }

  const englishName = [parsed.surname, parsed.givenNames]
    .filter(Boolean)
    .join(', ')

  const sex: PassportReviewForm['sex'] =
    parsed.sex === 'M' || parsed.sex === 'F' || parsed.sex === 'X'
      ? parsed.sex
      : ''

  reviewForm.value = {
    englishName,
    passportNumber: parsed.documentNumber,
    nationality: parsed.nationality,
    issuingState: parsed.issuingState,
    birthDate: mrzBirthDateToIso(parsed.birthDate),
    sex,
    expiryDate: mrzExpiryDateToIso(parsed.expiryDate),
  }
  reviewOriginal.value = { ...reviewForm.value }
  nameVisuallyConfirmed.value = false
  reviewConfirmed.value = false
  reviewedAt.value = null
  confirmedDraft.value = null
}

async function confirmReview() {
  if (
    !canConfirmReview.value ||
    !result.value ||
    reviewSubmitting.value
  ) {
    return
  }

  const timestamp = new Date().toISOString()
  const draft: PassportReviewDraft = {
    schemaVersion: 1,
    documentType: 'passport',
    englishName: reviewForm.value.englishName.trim(),
    passportNumber: reviewForm.value.passportNumber.trim(),
    nationality: reviewForm.value.nationality.trim(),
    issuingState: reviewForm.value.issuingState.trim(),
    birthDate: reviewForm.value.birthDate,
    sex: reviewForm.value.sex,
    expiryDate: reviewForm.value.expiryDate,
    verification: {
      passportNumberCheckDigit:
        result.value.line2Validation?.documentNumber ?? null,
      birthDateCheckDigit:
        result.value.line2Validation?.birthDate ?? null,
      expiryDateCheckDigit:
        result.value.line2Validation?.expiryDate ?? null,
      compositeCheckDigit:
        result.value.line2Validation?.composite ?? null,
    },
    reviewAssertions: {
      englishNameVisuallyConfirmed: nameVisuallyConfirmed.value,
    },
    ocr: {
      engine: 'paddleocr-ppocrv5',
      line2Validated:
        result.value.line2Validation?.requiredValid === true,
      fallbackUsed: result.value.fallbackUsed,
      averageScore: result.value.averageScore,
    },
    reviewedAt: timestamp,
  }

  reviewSubmitting.value = true
  reviewSubmitError.value = ''
  reviewApiReceipt.value = null

  try {
    const receipt = await savePassportReview(draft)

    confirmedDraft.value = draft
    reviewedAt.value = timestamp
    reviewConfirmed.value = true
    reviewApiReceipt.value = receipt
  } catch (err) {
    reviewConfirmed.value = false
    confirmedDraft.value = null
    reviewedAt.value = null
    reviewSubmitError.value =
      err instanceof Error
        ? err.message
        : '後端驗證失敗，請稍後再試。'
  } finally {
    reviewSubmitting.value = false
  }
}

function validationText(value: boolean | null | undefined) {
  if (value === true) return '通過'
  if (value === false) return '失敗'
  return '未驗證'
}

function validationClass(value: boolean | null | undefined) {
  if (value === true) return 'pass'
  if (value === false) return 'fail'
  return 'unknown'
}

function handleBatchFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])

  batchError.value = ''
  batchResults.value = []

  const valid = files.filter(
    (file) =>
      file.type.startsWith('image/') &&
      file.size <= 15 * 1024 * 1024,
  )

  batchFiles.value = valid.slice(0, 5)

  if (valid.length !== files.length) {
    batchError.value = '已忽略非圖片或超過 15 MB 的檔案。'
  }

  if (valid.length > 5) {
    batchError.value = '一次最多測 5 張，已取前 5 張。'
  } else if (batchFiles.value.length > 0 && batchFiles.value.length < 3) {
    batchError.value = '請選 3～5 張護照圖片。'
  }
}

async function runBatch() {
  if (!canRunBatch.value) return

  batchRunning.value = true
  batchCurrent.value = 0
  batchResults.value = []
  batchError.value = ''
  batchProgress.value = {
    completed: 0,
    total: batchFiles.value.length,
    current: 0,
    stage: 'initializing',
    message: '正在準備 PaddleOCR 模型…',
  }

  try {
    const results = await recognizePassportsWithPaddle(
      batchFiles.value,
      (progress) => {
        batchProgress.value = progress
        batchCurrent.value = progress.current
      },
    )

    batchResults.value = results.map((item, index) => ({
      index: index + 1,
      totalMs: item.totalMs,
      predictMs: item.predictMs,
      structureComplete: item.structureComplete,
      line1Valid: item.line1Valid,
      line2ChecksPassed:
        item.line2Validation?.requiredValid === true,
      averageScore: item.averageScore,
      correctedCharacters:
        item.mrzRepair?.correctedCharacters ?? 0,
      detectedBoxes: item.detectedBoxes,
      recognizedCount: item.recognizedCount,
      fallbackUsed: item.fallbackUsed,
      fallbackCropRatio: item.fallbackCropRatio,
      error: null,
    }))
  } catch (err) {
    batchError.value =
      err instanceof Error
        ? err.message
        : 'PaddleOCR 批次辨識失敗。'
  } finally {
    batchRunning.value = false
  }
}

watch(
  () => props.file,
  (file) => {
    revokeReviewImageUrl()
    result.value = null
    error.value = ''
    resetReviewForm()

    if (file) {
      reviewImageUrl.value = URL.createObjectURL(file)
    }
  },
  { immediate: true },
)

watch(
  () => reviewForm.value.englishName,
  () => {
    nameVisuallyConfirmed.value = false
  },
)

watch(
  reviewForm,
  () => {
    if (reviewConfirmed.value || confirmedDraft.value) {
      reviewConfirmed.value = false
      reviewedAt.value = null
      confirmedDraft.value = null
      reviewApiReceipt.value = null
      reviewSubmitError.value = ''
    }
  },
  { deep: true },
)

onBeforeUnmount(() => {
  revokeReviewImageUrl()
})

async function run() {
  if (!props.file || running.value) return

  running.value = true
  error.value = ''
  result.value = null

  try {
    result.value = await recognizePassportWithPaddle(props.file)
    populateReviewForm(result.value)

    if (result.value.parsedMrz) {
      await nextTick()
      reviewRef.value?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }
  } catch (err) {
    error.value =
      err instanceof Error
        ? err.message
        : 'PaddleOCR.js 執行失敗，請查看瀏覽器 Console。'
  } finally {
    running.value = false
  }
}
</script>

<template>
  <section class="baseline-card">
    <div class="heading">
      <div>
        <p class="label">Step 3 · Passport OCR</p>
        <h2>護照辨識與人工覆核</h2>
      </div>
      <span class="badge">PaddleOCR</span>
    </div>

    <p class="copy">
      使用 PaddleOCR / PP-OCRv5 在瀏覽器內辨識護照；完成後直接進入人工覆核。
      證件圖片不送到後端 OCR。第一次執行可能需要載入模型與瀏覽器推論資源。
    </p>

    <button type="button" :disabled="!canRun" @click="run">
      {{ running ? '護照辨識中…' : '開始護照辨識' }}
    </button>

    <p v-if="!file" class="hint">
      先在上方 Step 2 選擇一張護照圖片。
    </p>

    <p v-if="running" class="hint">
      第一次可能明顯較久，因為要初始化 PaddleOCR.js 與下載 PP-OCRv5 模型。
    </p>

    <div v-if="running" class="single-running" aria-live="polite">
      <div class="single-running-bar"></div>
      <span>護照 OCR 執行中，畫面可能暫時比較卡，請不要關閉頁面。</span>
    </div>

    <p v-if="error" class="error">
      {{ error }}
    </p>

    <div
      v-if="result && !result.line1Valid"
      class="warning"
    >
      MRZ 姓名行未可靠擷取，因此系統沒有自動建立人工覆核姓名。
      已避免把一般頁面文字誤當成姓名；請重新辨識這張護照或確認影像中的 MRZ 區域完整清楚。
    </div>

    <!-- Primary user workflow: review appears before developer diagnostics. -->
    <section
      v-if="result?.parsedMrz"
      ref="reviewRef"
      class="review-card"
    >
      <div class="review-heading">
        <div>
          <p class="label">Step 5 · Human review</p>
          <h2>護照人工覆核</h2>
          <p>
            辨識完成後先在這裡核對原始證件並修正欄位。
            MRZ check digit 通過代表機器可讀區結構一致，但英文姓名與日期仍須人工目視確認。
          </p>
        </div>

        <span
          class="review-status"
          :class="{ confirmed: reviewConfirmed }"
        >
          {{
            reviewConfirmed
              ? '已完成覆核'
              : changedReviewFields.length
                ? `待覆核 · 已修改 ${changedReviewFields.length} 欄`
                : '待人工覆核'
          }}
        </span>
      </div>

      <div class="review-layout">
        <div class="review-image">
          <img
            v-if="reviewImageUrl"
            :src="reviewImageUrl"
            alt="護照原始證件預覽"
          />
        </div>

        <div class="review-fields">
          <label class="review-field full">
            <span>
              英文姓名
              <em class="needs-review">人工確認</em>
            </span>
            <input
              v-model="reviewForm.englishName"
              type="text"
              maxlength="80"
              @blur="normalizeReviewText('englishName')"
            />
            <label class="name-confirmation">
              <input
                v-model="nameVisuallyConfirmed"
                type="checkbox"
              />
              <span>我已對照左側原始護照，確認英文姓名正確</span>
            </label>
          </label>

          <label class="review-field">
            <span>
              護照號碼
              <em
                :class="
                  result.line2Validation?.documentNumber
                    ? 'validated'
                    : 'needs-review'
                "
              >
                {{
                  result.line2Validation?.documentNumber
                    ? '檢查碼通過'
                    : '人工確認'
                }}
              </em>
            </span>
            <input
              v-model="reviewForm.passportNumber"
              type="text"
              maxlength="20"
              @blur="normalizeReviewText('passportNumber')"
            />
          </label>

          <label class="review-field">
            <span>
              國籍
              <em class="mrz-derived">MRZ</em>
            </span>
            <input
              v-model="reviewForm.nationality"
              type="text"
              maxlength="3"
              @blur="normalizeReviewText('nationality')"
            />
          </label>

          <label class="review-field">
            <span>
              簽發國
              <em class="mrz-derived">MRZ</em>
            </span>
            <input
              v-model="reviewForm.issuingState"
              type="text"
              maxlength="3"
              @blur="normalizeReviewText('issuingState')"
            />
          </label>

          <label class="review-field">
            <span>
              性別
              <em class="mrz-derived">MRZ</em>
            </span>
            <select v-model="reviewForm.sex">
              <option value="">未指定</option>
              <option value="M">M</option>
              <option value="F">F</option>
              <option value="X">X</option>
            </select>
          </label>

          <label class="review-field">
            <span>
              出生日期
              <em
                :class="
                  result.line2Validation?.birthDate
                    ? 'validated'
                    : 'needs-review'
                "
              >
                {{
                  result.line2Validation?.birthDate
                    ? '檢查碼通過'
                    : '人工確認'
                }}
              </em>
            </span>
            <input
              v-model="reviewForm.birthDate"
              type="date"
            />
            <small>由 MRZ 日期轉為 YYYY-MM-DD；請目視確認年份是否正確。</small>
          </label>

          <label class="review-field">
            <span>
              有效期限
              <em
                :class="
                  result.line2Validation?.expiryDate
                    ? 'validated'
                    : 'needs-review'
                "
              >
                {{
                  result.line2Validation?.expiryDate
                    ? '檢查碼通過'
                    : '人工確認'
                }}
              </em>
            </span>
            <input
              v-model="reviewForm.expiryDate"
              type="date"
            />
            <small>由 MRZ 日期轉為 YYYY-MM-DD。</small>
          </label>
        </div>
      </div>

      <div
        v-if="reviewErrors.length || reviewWarnings.length || changedReviewFields.length"
        class="review-notices"
      >
        <div v-if="reviewErrors.length" class="review-error-box">
          <strong>還有欄位需要修正</strong>
          <ul>
            <li v-for="message in reviewErrors" :key="message">
              {{ message }}
            </li>
          </ul>
        </div>

        <div v-if="reviewWarnings.length" class="review-warning-box">
          <strong>請注意</strong>
          <ul>
            <li v-for="message in reviewWarnings" :key="message">
              {{ message }}
            </li>
          </ul>
        </div>

        <div v-if="changedReviewFields.length" class="review-change-box">
          已人工修改：
          <strong>{{ changedReviewFields.join('、') }}</strong>
        </div>
      </div>

      <div v-if="reviewSubmitError" class="review-error-box review-submit-error">
        <strong>後端驗證沒有通過</strong>
        <div>{{ reviewSubmitError }}</div>
      </div>

      <div
        v-if="reviewApiReceipt?.warnings.length"
        class="review-warning-box review-submit-warning"
      >
        <strong>後端提醒</strong>
        <ul>
          <li
            v-for="message in reviewApiReceipt.warnings"
            :key="message"
          >
            {{ message }}
          </li>
        </ul>
      </div>

      <div class="review-footer">
        <div>
          <strong v-if="reviewConfirmed" class="pass">
            人工覆核完成，後端已接受這筆資料 · {{ formatReviewedAt(reviewedAt) }}
          </strong>
          <span v-else>
            確認前請至少目視核對英文姓名與原始護照。
          </span>
          <small v-if="reviewApiReceipt">
            {{
              reviewApiReceipt.action === 'CreatedTravelerAndDocument'
                ? '已建立新旅客與第一個護照版本。'
                : reviewApiReceipt.action === 'CreatedDocumentVersion'
                  ? '已找到既有旅客並建立新的護照版本。'
                  : '已找到同一本護照，更新本次覆核資訊，沒有重複建立版本。'
            }}
            此旅客目前有
            {{ reviewApiReceipt.travelerDocumentVersionCount }}
            個證件版本。現在使用測試用記憶體儲存，後端重啟後資料會清空。
          </small>
          <small v-else>
            按下確認後會送到後端做第二層格式驗證；目前尚未進資料庫。
          </small>
        </div>

        <div class="review-actions">
          <button
            v-if="changedReviewFields.length"
            type="button"
            class="secondary-review-button"
            @click="resetReviewToOcr"
          >
            還原 OCR
          </button>

          <button
            type="button"
            :disabled="!canConfirmReview || reviewSubmitting"
            @click="confirmReview"
          >
            {{
              reviewSubmitting
                ? '儲存中…'
                : reviewConfirmed
                  ? '已確認資料'
                  : '確認資料'
            }}
          </button>
        </div>
      </div>
    </section>

    <details v-if="result" class="developer-details">
      <summary>開發診斷：OCR、TD3、check digit、runtime</summary>
      <div class="results">
      <div class="summary">
        <div>
          <span>首次初始化</span>
          <strong>{{ (result.initializationMs / 1000).toFixed(2) }} 秒</strong>
        </div>
        <div>
          <span>本次推論</span>
          <strong>{{ (result.predictMs / 1000).toFixed(2) }} 秒</strong>
        </div>
        <div>
          <span>辨識文字區塊</span>
          <strong>{{ result.detectedItems }}</strong>
        </div>
        <div>
          <span>MRZ 姓名行</span>
          <strong :class="result.line1Valid ? 'pass' : 'fail'">
            {{ result.line1Valid ? 'TD3 結構通過' : '未可靠擷取' }}
          </strong>
        </div>
        <div>
          <span>TD3 2 × 44</span>
          <strong :class="result.structureComplete ? 'pass' : 'fail'">
            {{ result.structureComplete ? '結構完成' : '尚未完成' }}
          </strong>
        </div>
      </div>

      <div v-if="result.line2Validation" class="validation">
        <div class="validation-title">
          <div>
            <p class="label">MRZ LINE 2 CHECK DIGITS</p>
            <h3>
              {{
                result.line2Validation.requiredValid
                  ? '第二行關鍵檢查碼全部通過'
                  : '第二行仍有檢查碼失敗'
              }}
            </h3>
          </div>
          <strong
            :class="
              result.line2Validation.requiredValid ? 'pass' : 'fail'
            "
          >
            {{
              result.line2Validation.requiredValid
                ? '關鍵欄位可信度高'
                : '需要人工確認'
            }}
          </strong>
        </div>

        <div class="checks">
          <div>
            <span>護照號碼</span>
            <strong
              :class="validationClass(result.line2Validation.documentNumber)"
            >
              {{ validationText(result.line2Validation.documentNumber) }}
            </strong>
          </div>
          <div>
            <span>出生日期</span>
            <strong
              :class="validationClass(result.line2Validation.birthDate)"
            >
              {{ validationText(result.line2Validation.birthDate) }}
            </strong>
          </div>
          <div>
            <span>有效期限</span>
            <strong
              :class="validationClass(result.line2Validation.expiryDate)"
            >
              {{ validationText(result.line2Validation.expiryDate) }}
            </strong>
          </div>
          <div>
            <span>整體檢查碼</span>
            <strong
              :class="validationClass(result.line2Validation.composite)"
            >
              {{ validationText(result.line2Validation.composite) }}
            </strong>
          </div>
        </div>
      </div>

      <div v-else class="warning">
        尚未取得可驗證的 44 字元 Line 2。
      </div>

      <div class="meta">
        <span>
          Line 1 / Line 2：
          <strong>
            {{ result.mrzLine1?.length ?? '無' }} /
            {{ result.mrzLine2?.length ?? '無' }}
          </strong>
        </span>
        <span v-if="result.averageScore !== null">
          平均文字信心：
          <strong>{{ (result.averageScore * 100).toFixed(1) }}%</strong>
        </span>
        <span v-if="result.mrzRepair">
          受限自動修正：
          <strong>{{ result.mrzRepair.correctedCharacters }} 字元</strong>
        </span>
      </div>

      <details>
        <summary>查看 runtime 診斷（不含證件文字）</summary>
        <pre>{{ result.runtime }}</pre>
      </details>
      </div>
    </details>

    <details class="developer-details lab-details">
      <summary>開發測試：3～5 張 PaddleOCR 泛化測試</summary>
      <div class="batch-divider"></div>

    <div class="heading batch-heading">
      <div>
        <p class="label">Baseline B · Generalization</p>
        <h3>3～5 張 PaddleOCR 批次泛化測試</h3>
      </div>
      <span class="badge">Batch B</span>
    </div>

    <p class="copy">
      使用和單張 Baseline B 完全相同的 PP-OCRv5 流程，
      只比較不同護照與拍攝條件下的結構、check digit、速度與平均信心。
      摘要不顯示姓名或完整證件值。
    </p>

    <label class="batch-file">
      <span>批次測試圖片（3～5 張）</span>
      <input
        type="file"
        accept="image/*"
        multiple
        :disabled="batchRunning"
        @change="handleBatchFiles"
      />
    </label>

    <p v-if="batchError" class="error">
      {{ batchError }}
    </p>

    <div class="batch-actions">
      <span>
        已選 {{ batchFiles.length }} 張
        <template v-if="batchRunning">
          · {{ batchProgress.message }}
        </template>
      </span>

      <button
        type="button"
        :disabled="!canRunBatch"
        @click="runBatch"
      >
        {{ batchRunning ? 'PaddleOCR 批次測試中…' : '開始 Baseline B 批次測試' }}
      </button>
    </div>

    <div v-if="batchRunning" class="progress-panel" aria-live="polite">
      <div class="progress-copy">
        <span>{{ batchProgress.message }}</span>
        <strong>{{ Math.round(batchProgressPercent) }}%</strong>
      </div>

      <div class="progress-track">
        <div
          class="progress-fill"
          :class="{ active: batchRunning }"
          :style="{ width: batchProgressPercent + '%' }"
        ></div>
      </div>

      <p>
        模型只初始化一次，圖片會逐張推論；每完成一張就更新進度，
        避免整批運算時畫面看起來像當機。
      </p>
    </div>

    <div v-if="batchResults.length" class="batch-summary">
      <div>
        <span>完整通過</span>
        <strong>{{ batchPassCount }} / {{ batchResults.length }}</strong>
      </div>
      <div>
        <span>平均每張推論（批次估算）</span>
        <strong>{{ batchAveragePredictSeconds.toFixed(2) }} 秒</strong>
      </div>
    </div>

    <div v-if="batchResults.length" class="batch-grid">
      <article
        v-for="item in batchResults"
        :key="item.index"
        class="batch-item"
      >
        <div class="batch-item-title">
          <strong>測試 {{ item.index }}</strong>
          <strong
            :class="
              item.structureComplete && item.line2ChecksPassed
                ? 'pass'
                : 'fail'
            "
          >
            {{
              item.structureComplete && item.line2ChecksPassed
                ? '通過'
                : '需人工確認'
            }}
          </strong>
        </div>

        <dl>
          <div>
            <dt>本次推論</dt>
            <dd>
              {{ item.error ? '失敗' : (item.predictMs / 1000).toFixed(2) + ' 秒' }}
            </dd>
          </div>
          <div>
            <dt>MRZ 姓名行</dt>
            <dd>{{ item.line1Valid ? 'TD3 結構通過' : '未通過' }}</dd>
          </div>
          <div>
            <dt>TD3 2 × 44</dt>
            <dd>{{ item.structureComplete ? '完成' : '未完成' }}</dd>
          </div>
          <div>
            <dt>Line 2 檢查碼</dt>
            <dd>{{ item.line2ChecksPassed ? '全部通過' : '未全部通過' }}</dd>
          </div>
          <div>
            <dt>Detection 文字框</dt>
            <dd>{{ item.detectedBoxes ?? '無' }}</dd>
          </div>
          <div>
            <dt>Recognition 保留文字</dt>
            <dd>{{ item.recognizedCount ?? '無' }}</dd>
          </div>
          <div>
            <dt>Detection fallback</dt>
            <dd>
              {{
                item.fallbackUsed
                  ? '底部 ' + Math.round((item.fallbackCropRatio ?? 0) * 100) + '%'
                  : '未使用'
              }}
            </dd>
          </div>
          <div>
            <dt>平均文字信心</dt>
            <dd>
              {{
                item.averageScore === null
                  ? '無'
                  : (item.averageScore * 100).toFixed(1) + '%'
              }}
            </dd>
          </div>
          <div>
            <dt>受限自動修正</dt>
            <dd>
              {{ item.correctedCharacters > 0 ? item.correctedCharacters + ' 字元' : '無' }}
            </dd>
          </div>
        </dl>

        <p v-if="item.error" class="error">
          {{ item.error }}
        </p>
      </article>
    </div>
    </details>
  </section>
</template>

<style scoped>
.baseline-card {
  margin-top: 18px;
  border: 1px solid #dfe3ea;
  border-radius: 18px;
  background: #ffffff;
  padding: 24px;
}

.heading,
.validation-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.label {
  margin: 0 0 8px;
  color: #667085;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h2,
h3 {
  margin: 0;
}

h2 {
  font-size: 1.35rem;
}

h3 {
  font-size: 1.05rem;
}

.badge {
  border-radius: 999px;
  padding: 7px 11px;
  background: #f4ebff;
  color: #6938ef;
  font-size: 0.82rem;
  font-weight: 700;
  white-space: nowrap;
}

.copy,
.hint {
  color: #596273;
  line-height: 1.7;
}

.copy {
  margin: 16px 0 20px;
}

.hint {
  margin: 12px 0 0;
  font-size: 0.9rem;
}

button {
  border: 0;
  border-radius: 10px;
  background: #172033;
  color: #ffffff;
  padding: 11px 16px;
  cursor: pointer;
  font: inherit;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.error,
.fail {
  color: #b42318;
}

.pass {
  color: #087443;
}

.unknown {
  color: #667085;
}

.results {
  margin-top: 22px;
}

.summary,
.checks {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.summary > div,
.checks > div {
  border: 1px solid #e2e6ec;
  border-radius: 12px;
  padding: 14px;
}

.summary span,
.summary strong,
.checks span,
.checks strong {
  display: block;
}

.summary span,
.checks span {
  color: #667085;
  font-size: 0.84rem;
  margin-bottom: 6px;
}

.validation {
  margin-top: 14px;
  border: 1px solid #dfe3ea;
  border-radius: 14px;
  padding: 18px;
  background: #fbfcfe;
}

.checks {
  margin-top: 16px;
}

.warning {
  margin-top: 14px;
  border-radius: 12px;
  background: #fff7ed;
  color: #9a3412;
  padding: 14px 16px;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 20px;
  margin-top: 14px;
  color: #667085;
  font-size: 0.88rem;
}

.single-running {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
  color: #596273;
  font-size: 0.9rem;
}

.single-running-bar {
  position: relative;
  width: 120px;
  height: 9px;
  overflow: hidden;
  border-radius: 999px;
  background: #e9edf3;
}

.single-running-bar::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 42%;
  border-radius: inherit;
  background: #172033;
  animation: single-running 1.05s ease-in-out infinite;
}

@keyframes single-running {
  from {
    transform: translateX(-110%);
  }
  to {
    transform: translateX(340%);
  }
}

.review-card {
  margin-top: 26px;
  border: 1px solid #cfd7e6;
  border-radius: 18px;
  padding: 22px;
  background: #f9fbff;
}

.review-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.review-heading h2 {
  margin: 0;
}

.review-heading p:not(.label) {
  margin: 8px 0 0;
  max-width: 680px;
  color: #596273;
  line-height: 1.65;
}

.review-status {
  border-radius: 999px;
  padding: 7px 11px;
  background: #fff7ed;
  color: #9a3412;
  font-size: 0.82rem;
  font-weight: 700;
  white-space: nowrap;
}

.review-status.confirmed {
  background: #ecfdf3;
  color: #087443;
}

.review-layout {
  display: grid;
  grid-template-columns: minmax(280px, 0.95fr) minmax(360px, 1.05fr);
  gap: 20px;
  margin-top: 20px;
}

.review-image {
  display: grid;
  place-items: center;
  min-height: 380px;
  overflow: hidden;
  border-radius: 14px;
  background: #111827;
}

.review-image img {
  display: block;
  width: 100%;
  max-height: 620px;
  object-fit: contain;
}

.review-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  align-content: start;
}

.review-field {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.review-field.full {
  grid-column: 1 / -1;
}

.review-field > span {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.88rem;
  font-weight: 700;
}

.review-field input,
.review-field select {
  width: 100%;
  min-height: 44px;
  border: 1px solid #cfd5df;
  border-radius: 10px;
  padding: 10px 12px;
  background: #ffffff;
  color: #172033;
  font: inherit;
}

.name-confirmation {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: #475467;
  font-size: 0.82rem;
  font-weight: 600;
  line-height: 1.45;
}

.name-confirmation input {
  width: auto;
  min-height: auto;
  margin-top: 2px;
}

.review-field small {
  color: #667085;
  font-size: 0.78rem;
  line-height: 1.5;
}

.review-field em {
  border-radius: 999px;
  padding: 4px 7px;
  font-size: 0.72rem;
  font-style: normal;
  font-weight: 700;
  white-space: nowrap;
}

.validated {
  background: #ecfdf3;
  color: #087443;
}

.needs-review {
  background: #fff7ed;
  color: #9a3412;
}

.mrz-derived {
  background: #eef4ff;
  color: #3538cd;
}

.review-submit-error,
.review-submit-warning {
  margin-top: 12px;
}

.review-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-top: 18px;
  border-top: 1px solid #dfe3ea;
  padding-top: 18px;
}

.review-footer > div {
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: #596273;
}

.review-footer small {
  color: #667085;
  line-height: 1.5;
}

.review-notices {
  display: grid;
  gap: 10px;
  margin-top: 18px;
}

.review-error-box,
.review-warning-box,
.review-change-box {
  border-radius: 12px;
  padding: 12px 14px;
  font-size: 0.86rem;
  line-height: 1.55;
}

.review-error-box {
  background: #fff1f1;
  color: #b42318;
}

.review-warning-box {
  background: #fff7ed;
  color: #9a3412;
}

.review-change-box {
  background: #eef4ff;
  color: #344054;
}

.review-error-box ul,
.review-warning-box ul {
  margin: 6px 0 0;
  padding-left: 20px;
}

.review-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.secondary-review-button {
  background: #eef1f5;
  color: #344054;
}

.developer-details {
  margin-top: 24px;
  border: 1px solid #e2e6ec;
  border-radius: 14px;
  background: #ffffff;
  overflow: hidden;
}

.developer-details > summary {
  cursor: pointer;
  padding: 14px 16px;
  color: #475467;
  font-weight: 700;
  background: #f8fafc;
}

.developer-details > .results,
.developer-details > .batch-divider,
.developer-details > .batch-heading,
.developer-details > .copy,
.developer-details > .batch-file,
.developer-details > .error,
.developer-details > .batch-actions,
.developer-details > .progress-panel,
.developer-details > .batch-summary,
.developer-details > .batch-grid {
  margin-left: 16px;
  margin-right: 16px;
}

.lab-details {
  margin-top: 16px;
  padding-bottom: 16px;
}

.technical-divider {
  height: 1px;
  margin: 28px 0 18px;
  background: #e2e6ec;
}

.batch-divider {
  height: 1px;
  margin: 28px 0;
  background: #e2e6ec;
}

.batch-heading {
  margin-bottom: 0;
}

.batch-file {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-weight: 700;
}

.batch-file input {
  min-height: 44px;
  border: 1px solid #cfd5df;
  border-radius: 10px;
  padding: 9px 11px;
  background: #ffffff;
  font: inherit;
}

.batch-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 16px;
  color: #596273;
  font-size: 0.9rem;
}

.batch-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 18px;
}

.batch-summary > div {
  border: 1px solid #e2e6ec;
  border-radius: 12px;
  padding: 14px;
  background: #fbfcfe;
}

.batch-summary span,
.batch-summary strong {
  display: block;
}

.batch-summary span {
  color: #667085;
  font-size: 0.84rem;
  margin-bottom: 6px;
}

.batch-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 14px;
}

.batch-item {
  border: 1px solid #e2e6ec;
  border-radius: 14px;
  padding: 16px;
}

.batch-item-title {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.batch-item dl {
  margin: 0;
}

.batch-item dl > div {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  padding: 8px 0;
  border-top: 1px solid #eef1f5;
}

.batch-item dt {
  color: #667085;
}

.batch-item dd {
  margin: 0;
  text-align: right;
  font-weight: 700;
}

.progress-panel {
  margin-top: 16px;
  border: 1px solid #dfe3ea;
  border-radius: 14px;
  padding: 16px;
  background: #fbfcfe;
}

.progress-copy {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 10px;
  color: #344054;
}

.progress-track {
  position: relative;
  height: 12px;
  overflow: hidden;
  border-radius: 999px;
  background: #e9edf3;
}

.progress-fill {
  position: relative;
  height: 100%;
  min-width: 2%;
  border-radius: inherit;
  background: #172033;
  transition: width 220ms ease;
}

.progress-fill.active::after {
  content: '';
  position: absolute;
  inset: 0;
  width: 45%;
  transform: translateX(-120%);
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.48),
    transparent
  );
  animation: progress-shimmer 1.1s linear infinite;
}

.progress-panel p {
  margin: 10px 0 0;
  color: #667085;
  font-size: 0.84rem;
  line-height: 1.6;
}

@keyframes progress-shimmer {
  to {
    transform: translateX(320%);
  }
}

details {
  margin-top: 14px;
  border: 1px solid #e2e6ec;
  border-radius: 12px;
  overflow: hidden;
}

summary {
  cursor: pointer;
  padding: 12px 14px;
  font-weight: 700;
}

pre {
  margin: 0;
  border-top: 1px solid #e2e6ec;
  padding: 14px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 0.82rem;
}

@media (max-width: 760px) {
  .heading,
  .validation-title,
  .review-heading {
    flex-direction: column;
  }

  .review-layout {
    grid-template-columns: 1fr;
  }

  .summary,
  .checks,
  .batch-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .summary,
  .checks,
  .batch-summary,
  .batch-grid {
    grid-template-columns: 1fr;
  }

  .batch-actions,
  .review-footer,
  .review-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .review-fields {
    grid-template-columns: 1fr;
  }

  .review-field.full {
    grid-column: auto;
  }
}
</style>
