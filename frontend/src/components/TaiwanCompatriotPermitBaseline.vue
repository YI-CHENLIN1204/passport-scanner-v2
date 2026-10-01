<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue'
import {
  recognizeTaiwanCompatriotPermitWithPaddle,
  type TaiwanCompatriotPermitOcrResult,
} from '../services/paddleOcr'
import {
  saveTaiwanCompatriotPermitReview,
  type TaiwanCompatriotPermitReviewSaveResponse,
} from '../services/api'
import type {
  TaiwanCompatriotPermitReviewDraft,
  TaiwanCompatriotPermitReviewForm,
} from '../models/taiwanCompatriotPermitReview'

const props = defineProps<{
  file: File | null
}>()

const running = ref(false)
const error = ref('')
const result = ref<TaiwanCompatriotPermitOcrResult | null>(null)

const form = ref<TaiwanCompatriotPermitReviewForm>({
  chineseName: '',
  permitNumber: '',
  birthDate: '',
  sex: '',
  expiryDate: '',
})

const original = ref<TaiwanCompatriotPermitReviewForm | null>(null)
const visuallyConfirmed = ref(false)
const submitting = ref(false)
const submitError = ref('')
const receipt =
  ref<TaiwanCompatriotPermitReviewSaveResponse | null>(null)

const imageUrl = ref('')
const imageZoom = ref(1)
const panX = ref(0)
const panY = ref(0)
const dragging = ref(false)

let pointerX = 0
let pointerY = 0

const canRun = computed(
  () => props.file !== null && !running.value,
)

const errors = computed(() => {
  const messages: string[] = []
  const value = form.value

  if (
    !/^[\p{Script=Han}·‧ ]{2,20}$/u.test(
      value.chineseName.trim(),
    )
  ) {
    messages.push('中文姓名不可空白，請依台胞證原圖確認。')
  }

  if (!/^\d{8}$/.test(value.permitNumber.trim())) {
    messages.push(
      '台胞證號碼必須為 8 位數字；不要把後面的簽發次數一起輸入。',
    )
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.birthDate)) {
    messages.push('出生日期請使用 YYYY-MM-DD。')
  } else {
    const birth = new Date(`${value.birthDate}T00:00:00`)
    const now = new Date()
    now.setHours(0, 0, 0, 0)

    if (
      Number.isNaN(birth.getTime()) ||
      birth > now
    ) {
      messages.push('出生日期不合理，請重新確認。')
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.expiryDate)) {
    messages.push('有效期限請使用 YYYY-MM-DD。')
  }

  if (!['', 'M', 'F', 'X'].includes(value.sex)) {
    messages.push('性別欄位格式不正確。')
  }

  return messages
})

const warnings = computed(() => {
  const messages: string[] = []

  if (/^\d{4}-\d{2}-\d{2}$/.test(form.value.expiryDate)) {
    const expiry = new Date(
      `${form.value.expiryDate}T23:59:59`,
    )

    if (
      !Number.isNaN(expiry.getTime()) &&
      expiry < new Date()
    ) {
      messages.push('這張台胞證目前已過有效期限。')
    }
  }

  return messages
})

const changedFields = computed(() => {
  if (!original.value) return []

  const labels: Record<
    keyof TaiwanCompatriotPermitReviewForm,
    string
  > = {
    chineseName: '中文姓名',
    permitNumber: '台胞證號碼',
    birthDate: '出生日期',
    sex: '性別',
    expiryDate: '有效期限',
  }

  return (
    Object.keys(labels) as Array<
      keyof TaiwanCompatriotPermitReviewForm
    >
  )
    .filter(
      (key) =>
        form.value[key] !== original.value?.[key],
    )
    .map((key) => labels[key])
})

const canSave = computed(
  () =>
    result.value !== null &&
    errors.value.length === 0 &&
    visuallyConfirmed.value &&
    !submitting.value,
)

function resetImageView() {
  imageZoom.value = 1
  panX.value = 0
  panY.value = 0
  dragging.value = false
}

function setZoom(value: number) {
  imageZoom.value =
    Math.round(
      Math.min(4, Math.max(1, value)) * 100,
    ) / 100

  if (imageZoom.value === 1) {
    panX.value = 0
    panY.value = 0
  }
}

function onWheel(event: WheelEvent) {
  setZoom(
    imageZoom.value +
      (event.deltaY < 0 ? 0.25 : -0.25),
  )
}

function startDrag(event: PointerEvent) {
  if (imageZoom.value <= 1) return

  dragging.value = true
  pointerX = event.clientX
  pointerY = event.clientY

  const target = event.currentTarget
  if (target instanceof HTMLElement) {
    target.setPointerCapture(event.pointerId)
  }
}

function moveDrag(event: PointerEvent) {
  if (!dragging.value) return

  panX.value += event.clientX - pointerX
  panY.value += event.clientY - pointerY
  pointerX = event.clientX
  pointerY = event.clientY
}

function endDrag(event: PointerEvent) {
  dragging.value = false

  const target = event.currentTarget
  if (
    target instanceof HTMLElement &&
    target.hasPointerCapture(event.pointerId)
  ) {
    target.releasePointerCapture(event.pointerId)
  }
}

function revokeImageUrl() {
  if (imageUrl.value) {
    URL.revokeObjectURL(imageUrl.value)
    imageUrl.value = ''
  }
}

function populate(
  ocr: TaiwanCompatriotPermitOcrResult,
) {
  form.value = {
    chineseName: ocr.chineseName,
    permitNumber: ocr.permitNumber,
    birthDate: ocr.birthDate,
    sex: ocr.sex,
    expiryDate: ocr.expiryDate,
  }

  original.value = { ...form.value }
  visuallyConfirmed.value = false
  receipt.value = null
  submitError.value = ''
}

function resetToOcr() {
  if (!original.value) return

  form.value = { ...original.value }
  visuallyConfirmed.value = false
  receipt.value = null
  submitError.value = ''
}

function normalizeName() {
  form.value.chineseName =
    form.value.chineseName
      .trim()
      .replace(/\s+/g, ' ')
}

function normalizePermitNumber() {
  form.value.permitNumber =
    form.value.permitNumber.replace(/\D/g, '').slice(0, 8)
}

async function run() {
  if (!props.file || running.value) return

  running.value = true
  error.value = ''
  receipt.value = null
  submitError.value = ''

  try {
    const ocr =
      await recognizeTaiwanCompatriotPermitWithPaddle(
        props.file,
      )

    result.value = ocr
    populate(ocr)
  } catch (err) {
    result.value = null
    error.value =
      err instanceof Error
        ? err.message
        : '台胞證 OCR 執行失敗。'
  } finally {
    running.value = false
  }
}

async function save() {
  if (!canSave.value || !result.value) return

  submitting.value = true
  submitError.value = ''
  receipt.value = null

  const draft: TaiwanCompatriotPermitReviewDraft = {
    schemaVersion: 1,
    documentType: 'taiwan-compatriot-permit',
    chineseName: form.value.chineseName.trim(),
    permitNumber: form.value.permitNumber.trim(),
    birthDate: form.value.birthDate,
    sex: form.value.sex,
    expiryDate: form.value.expiryDate,
    reviewAssertions: {
      allFieldsVisuallyConfirmed:
        visuallyConfirmed.value,
    },
    ocr: {
      engine: 'paddleocr-ppocrv5',
      extractedFieldCount:
        result.value.extractedFieldCount,
      averageScore: result.value.averageScore,
    },
    reviewedAt: new Date().toISOString(),
  }

  try {
    receipt.value =
      await saveTaiwanCompatriotPermitReview(draft)
  } catch (err) {
    submitError.value =
      err instanceof Error
        ? err.message
        : '後端儲存失敗。'
  } finally {
    submitting.value = false
  }
}

watch(
  () => props.file,
  (file) => {
    revokeImageUrl()
    resetImageView()

    result.value = null
    original.value = null
    error.value = ''
    submitError.value = ''
    receipt.value = null
    visuallyConfirmed.value = false

    form.value = {
      chineseName: '',
      permitNumber: '',
      birthDate: '',
      sex: '',
      expiryDate: '',
    }

    if (file) {
      imageUrl.value = URL.createObjectURL(file)
    }
  },
  { immediate: true },
)

watch(
  form,
  () => {
    visuallyConfirmed.value = false
    receipt.value = null
  },
  { deep: true },
)

onBeforeUnmount(revokeImageUrl)
</script>

<template>
  <section class="permit-card">
    <div class="heading">
      <div>
        <p class="label">Step 3 · Taiwan Compatriot Permit</p>
        <h2>台胞證辨識與人工覆核</h2>
        <p>
          先以 PP-OCRv5 讀取姓名、8 位台胞證號碼、出生日期、性別與有效期限。
          台胞證沒有沿用護照 MRZ check digit，因此儲存前必須人工核對整張證件。
        </p>
      </div>

      <span class="badge">PaddleOCR</span>
    </div>

    <button
      type="button"
      :disabled="!canRun"
      @click="run"
    >
      {{ running ? '台胞證辨識中…' : '開始台胞證辨識' }}
    </button>

    <div
      v-if="running"
      class="running-panel"
      aria-live="polite"
    >
      <div class="running-bar"></div>
      <span>
        OCR 執行中。第一次可能需要載入模型，畫面短暫變慢屬正常現象。
      </span>
    </div>

    <p v-if="!file" class="hint">
      先在上方選擇一張台胞證圖片。
    </p>

    <p v-if="error" class="error">
      {{ error }}
    </p>

    <div v-if="result" class="ocr-summary">
      <div>
        <span>本次推論</span>
        <strong>
          {{ (result.predictMs / 1000).toFixed(2) }} 秒
        </strong>
      </div>
      <div>
        <span>辨識文字區塊</span>
        <strong>{{ result.detectedItems }}</strong>
      </div>
      <div>
        <span>自動帶入欄位</span>
        <strong>
          {{ result.extractedFieldCount }} / 5
        </strong>
      </div>
      <div>
        <span>平均 OCR 信心</span>
        <strong>
          {{
            result.averageScore === null
              ? '無'
              : (result.averageScore * 100).toFixed(1) + '%'
          }}
        </strong>
      </div>
    </div>

    <section v-if="result" class="review-card">
      <div class="review-title">
        <div>
          <p class="label">Human review</p>
          <h3>台胞證人工覆核</h3>
        </div>
        <span class="manual-badge">
          全欄人工確認
        </span>
      </div>

      <div class="review-layout">
        <div class="image-shell">
          <div class="image-toolbar">
            <button
              type="button"
              :disabled="imageZoom <= 1"
              @click="setZoom(imageZoom - 0.25)"
            >
              −
            </button>
            <button
              type="button"
              @click="resetImageView"
            >
              {{ Math.round(imageZoom * 100) }}%
            </button>
            <button
              type="button"
              :disabled="imageZoom >= 4"
              @click="setZoom(imageZoom + 0.25)"
            >
              ＋
            </button>
            <button
              type="button"
              class="fit-button"
              @click="resetImageView"
            >
              適合視窗
            </button>
          </div>

          <div
            class="image-panel"
            :class="{
              zoomed: imageZoom > 1,
              dragging,
            }"
            @wheel.prevent="onWheel"
            @pointerdown="startDrag"
            @pointermove="moveDrag"
            @pointerup="endDrag"
            @pointercancel="endDrag"
          >
            <img
              v-if="imageUrl"
              :src="imageUrl"
              :style="{
                transform:
                  `translate(${panX}px, ${panY}px) scale(${imageZoom})`,
              }"
              draggable="false"
              alt="台胞證原始圖片"
              @dblclick="resetImageView"
            />
          </div>
        </div>

        <div class="fields">
          <label class="field full">
            <span>中文姓名</span>
            <input
              v-model="form.chineseName"
              type="text"
              maxlength="20"
              placeholder="OCR 抓不到時請人工輸入"
              @blur="normalizeName"
            />
          </label>

          <label class="field">
            <span>台胞證號碼</span>
            <input
              v-model="form.permitNumber"
              type="text"
              inputmode="numeric"
              maxlength="8"
              placeholder="8 位數字"
              @input="normalizePermitNumber"
            />
            <small>
              只保存 8 位證件號碼，不保存簽發次數。
            </small>
          </label>

          <label class="field">
            <span>性別</span>
            <select v-model="form.sex">
              <option value="">未指定</option>
              <option value="M">M</option>
              <option value="F">F</option>
              <option value="X">X</option>
            </select>
          </label>

          <label class="field">
            <span>出生日期</span>
            <input
              v-model="form.birthDate"
              type="date"
            />
          </label>

          <label class="field">
            <span>有效期限</span>
            <input
              v-model="form.expiryDate"
              type="date"
            />
          </label>

          <label class="confirmation full">
            <input
              v-model="visuallyConfirmed"
              type="checkbox"
            />
            <span>
              我已對照左側原始台胞證，確認姓名、證號、出生日期、性別與有效期限正確
            </span>
          </label>
        </div>
      </div>

      <div
        v-if="
          errors.length ||
          warnings.length ||
          changedFields.length
        "
        class="notices"
      >
        <div v-if="errors.length" class="error-box">
          <strong>還有欄位需要修正</strong>
          <ul>
            <li
              v-for="message in errors"
              :key="message"
            >
              {{ message }}
            </li>
          </ul>
        </div>

        <div v-if="warnings.length" class="warning-box">
          <strong>請注意</strong>
          <ul>
            <li
              v-for="message in warnings"
              :key="message"
            >
              {{ message }}
            </li>
          </ul>
        </div>

        <div
          v-if="changedFields.length"
          class="change-box"
        >
          已人工修改：
          <strong>{{ changedFields.join('、') }}</strong>
        </div>
      </div>

      <div v-if="submitError" class="error-box submit-box">
        {{ submitError }}
      </div>

      <div class="review-footer">
        <div>
          <strong v-if="receipt" class="success">
            {{
              receipt.action === 'CreatedTravelerAndDocument'
                ? '已建立新旅客與第一個台胞證版本。'
                : receipt.action === 'CreatedDocumentVersion'
                  ? '已找到既有旅客並建立新的台胞證版本。'
                  : '已更新同一張台胞證，沒有重複建立版本。'
            }}
          </strong>
          <span v-else>
            確認後會送到後端驗證並進入目前的測試用旅客／證件版本儲存。
          </span>

          <small v-if="receipt">
            此旅客目前有
            {{ receipt.travelerDocumentVersionCount }}
            個證件版本。後端重啟後測試資料仍會清空。
          </small>
        </div>

        <div class="actions">
          <button
            v-if="changedFields.length"
            type="button"
            class="secondary"
            @click="resetToOcr"
          >
            還原 OCR
          </button>

          <button
            type="button"
            :disabled="!canSave"
            @click="save"
          >
            {{
              submitting
                ? '儲存中…'
                : receipt
                  ? '已確認資料'
                  : '確認並儲存'
            }}
          </button>
        </div>
      </div>
    </section>

    <details v-if="result" class="debug">
      <summary>開發診斷：台胞證 OCR 原始行</summary>
      <pre>{{ result.rawRows.join('\n') }}</pre>
    </details>
  </section>
</template>

<style scoped>
.permit-card {
  margin-top: 22px;
  border: 1px solid #d7dde8;
  border-radius: 18px;
  padding: 24px;
  background: #ffffff;
}

.heading,
.review-title,
.review-footer,
.actions,
.image-toolbar {
  display: flex;
  align-items: center;
}

.heading,
.review-title,
.review-footer {
  justify-content: space-between;
  gap: 18px;
}

.heading {
  align-items: flex-start;
}

.heading h2,
.review-title h3 {
  margin: 2px 0 0;
  color: #172033;
}

.heading p:not(.label) {
  max-width: 720px;
  margin: 8px 0 0;
  color: #667085;
  line-height: 1.65;
}

.label {
  margin: 0;
  color: #667085;
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.badge,
.manual-badge {
  border-radius: 999px;
  padding: 6px 10px;
  white-space: nowrap;
  font-size: 0.78rem;
  font-weight: 700;
}

.badge {
  background: #eef4ff;
  color: #3538cd;
}

.manual-badge {
  background: #fff7ed;
  color: #9a3412;
}

button {
  border: 0;
  border-radius: 10px;
  padding: 10px 16px;
  background: #172033;
  color: #ffffff;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.heading + button {
  margin-top: 18px;
}

.running-panel {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
  color: #667085;
}

.running-bar {
  position: relative;
  width: 130px;
  height: 9px;
  overflow: hidden;
  border-radius: 999px;
  background: #e9edf3;
}

.running-bar::after {
  content: '';
  position: absolute;
  inset-block: 0;
  width: 42%;
  border-radius: inherit;
  background: #172033;
  animation: slide 1.05s ease-in-out infinite;
}

@keyframes slide {
  from {
    transform: translateX(-110%);
  }

  to {
    transform: translateX(340%);
  }
}

.hint,
.error {
  margin: 14px 0 0;
  color: #667085;
}

.error {
  color: #b42318;
}

.ocr-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 18px;
}

.ocr-summary > div {
  border: 1px solid #e1e5ec;
  border-radius: 12px;
  padding: 12px 14px;
}

.ocr-summary span,
.ocr-summary strong {
  display: block;
}

.ocr-summary span {
  color: #667085;
  font-size: 0.78rem;
}

.ocr-summary strong {
  margin-top: 5px;
  color: #172033;
}

.review-card {
  margin-top: 20px;
  border: 1px solid #cfd7e6;
  border-radius: 16px;
  padding: 20px;
  background: #f9fbff;
}

.review-layout {
  display: grid;
  grid-template-columns:
    minmax(280px, 0.95fr)
    minmax(360px, 1.05fr);
  gap: 20px;
  margin-top: 18px;
}

.image-toolbar {
  gap: 8px;
  margin-bottom: 8px;
}

.image-toolbar button {
  border: 1px solid #d0d5dd;
  padding: 6px 10px;
  background: #ffffff;
  color: #344054;
  min-height: 34px;
}

.fit-button {
  margin-left: auto;
}

.image-panel {
  display: grid;
  place-items: center;
  min-height: 380px;
  overflow: hidden;
  border-radius: 14px;
  background: #111827;
  touch-action: none;
  user-select: none;
}

.image-panel.zoomed {
  cursor: grab;
}

.image-panel.dragging {
  cursor: grabbing;
}

.image-panel img {
  display: block;
  width: 100%;
  max-height: 620px;
  object-fit: contain;
  transform-origin: center;
  pointer-events: none;
  user-select: none;
}

.fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  align-content: start;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.field.full,
.confirmation.full {
  grid-column: 1 / -1;
}

.field > span {
  color: #172033;
  font-size: 0.88rem;
  font-weight: 700;
}

.field input,
.field select {
  min-height: 44px;
  width: 100%;
  border: 1px solid #cfd5df;
  border-radius: 10px;
  padding: 10px 12px;
  background: #ffffff;
  color: #172033;
  font: inherit;
}

.field small {
  color: #667085;
  line-height: 1.5;
}

.confirmation {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: #475467;
  font-size: 0.84rem;
  font-weight: 600;
  line-height: 1.5;
}

.notices {
  display: grid;
  gap: 10px;
  margin-top: 18px;
}

.error-box,
.warning-box,
.change-box {
  border-radius: 12px;
  padding: 12px 14px;
  line-height: 1.55;
}

.error-box {
  background: #fff1f1;
  color: #b42318;
}

.warning-box {
  background: #fff7ed;
  color: #9a3412;
}

.change-box {
  background: #eef4ff;
  color: #344054;
}

.error-box ul,
.warning-box ul {
  margin: 6px 0 0;
  padding-left: 20px;
}

.submit-box {
  margin-top: 12px;
}

.review-footer {
  margin-top: 18px;
  border-top: 1px solid #dfe3ea;
  padding-top: 18px;
}

.review-footer > div:first-child {
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: #667085;
}

.success {
  color: #087443;
}

.actions {
  gap: 10px;
}

.secondary {
  background: #eef1f5;
  color: #344054;
}

.debug {
  margin-top: 16px;
  border: 1px solid #e1e5ec;
  border-radius: 12px;
  overflow: hidden;
}

.debug summary {
  cursor: pointer;
  padding: 12px 14px;
  background: #f8fafc;
  color: #475467;
  font-weight: 700;
}

.debug pre {
  margin: 0;
  max-height: 280px;
  overflow: auto;
  padding: 14px;
  white-space: pre-wrap;
}

@media (max-width: 760px) {
  .heading,
  .review-title,
  .review-footer,
  .actions {
    align-items: stretch;
    flex-direction: column;
  }

  .review-layout,
  .fields,
  .ocr-summary {
    grid-template-columns: 1fr;
  }

  .field.full,
  .confirmation.full {
    grid-column: auto;
  }
}
</style>
