<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  recognizePassportWithPaddle,
  recognizePassportsWithPaddle,
  type PaddleBaselineResult,
  type PaddleBatchProgress,
} from '../services/paddleOcr'

const props = defineProps<{
  file: File | null
}>()

const running = ref(false)
const error = ref('')
const result = ref<PaddleBaselineResult | null>(null)

interface PassportReviewForm {
  englishName: string
  passportNumber: string
  nationality: string
  issuingState: string
  birthDate: string
  sex: string
  expiryDate: string
}

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

interface PaddleBatchResult {
  index: number
  totalMs: number
  predictMs: number
  structureComplete: boolean
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

const canConfirmReview = computed(() =>
  Boolean(
    result.value?.parsedMrz &&
      reviewForm.value.englishName.trim() &&
      reviewForm.value.passportNumber.trim() &&
      reviewForm.value.nationality.trim() &&
      reviewForm.value.issuingState.trim() &&
      reviewForm.value.birthDate.trim() &&
      reviewForm.value.expiryDate.trim(),
  ),
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

function populateReviewForm(ocrResult: PaddleBaselineResult) {
  const parsed = ocrResult.parsedMrz
  if (!parsed) {
    resetReviewForm()
    return
  }

  const englishName = [parsed.surname, parsed.givenNames]
    .filter(Boolean)
    .join(', ')

  reviewForm.value = {
    englishName,
    passportNumber: parsed.documentNumber,
    nationality: parsed.nationality,
    issuingState: parsed.issuingState,
    birthDate: mrzBirthDateToIso(parsed.birthDate),
    sex: parsed.sex === '<' ? '' : parsed.sex,
    expiryDate: mrzExpiryDateToIso(parsed.expiryDate),
  }
  reviewConfirmed.value = false
}

function confirmReview() {
  if (!canConfirmReview.value) return
  reviewConfirmed.value = true
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
  reviewForm,
  () => {
    reviewConfirmed.value = false
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
        <p class="label">Baseline B · PaddleOCR.js</p>
        <h2>PP-OCRv5 瀏覽器端護照辨識</h2>
      </div>
      <span class="badge">Baseline B</span>
    </div>

    <p class="copy">
      這組不使用 Tesseract。改用 PaddleOCR 官方瀏覽器 SDK，
      直接做文字偵測 + PP-OCRv5 英文辨識。證件圖片仍在瀏覽器內處理；
      第一次執行會下載模型與 WebAssembly / ONNX Runtime 資源。
    </p>

    <button type="button" :disabled="!canRun" @click="run">
      {{ running ? 'PaddleOCR 載入／辨識中…' : '開始 Baseline B' }}
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

    <!-- Primary user workflow: review appears before developer diagnostics. -->
    <section v-if="result?.parsedMrz" class="review-card">
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
          {{ reviewConfirmed ? '已完成覆核' : '待人工覆核' }}
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
            <input v-model="reviewForm.englishName" type="text" />
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
            <input v-model="reviewForm.passportNumber" type="text" />
          </label>

          <label class="review-field">
            <span>
              國籍
              <em class="mrz-derived">MRZ</em>
            </span>
            <input v-model="reviewForm.nationality" type="text" maxlength="3" />
          </label>

          <label class="review-field">
            <span>
              簽發國
              <em class="mrz-derived">MRZ</em>
            </span>
            <input v-model="reviewForm.issuingState" type="text" maxlength="3" />
          </label>

          <label class="review-field">
            <span>
              性別
              <em class="mrz-derived">MRZ</em>
            </span>
            <input v-model="reviewForm.sex" type="text" maxlength="1" />
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

      <div class="review-footer">
        <div>
          <strong v-if="reviewConfirmed" class="pass">
            此筆已在瀏覽器完成人工覆核。
          </strong>
          <span v-else>
            確認前請至少目視核對英文姓名與原始護照。
          </span>
          <small>
            目前「確認資料」只更新前端覆核狀態，尚未寫入後端、旅客主檔或 Google Sheets。
          </small>
        </div>

        <button
          type="button"
          :disabled="!canConfirmReview"
          @click="confirmReview"
        >
          {{ reviewConfirmed ? '已確認資料' : '確認資料' }}
        </button>
      </div>
    </section>

    <div class="technical-divider" v-if="result"></div>
    <div v-if="result" class="results">
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

.review-field input {
  width: 100%;
  min-height: 44px;
  border: 1px solid #cfd5df;
  border-radius: 10px;
  padding: 10px 12px;
  background: #ffffff;
  color: #172033;
  font: inherit;
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
  .review-footer {
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
