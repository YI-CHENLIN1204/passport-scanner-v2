<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue'
import {
  recognizeTaiwanNationalIdWithPaddle,
  validateTaiwanNationalId,
  type TaiwanNationalIdOcrProgress,
  type TaiwanNationalIdOcrResult,
} from '../services/paddleOcr'
import {
  saveTaiwanNationalIdReview,
  type TaiwanNationalIdReviewSaveResponse,
} from '../services/api'
import type {
  TaiwanNationalIdReviewDraft,
  TaiwanNationalIdReviewForm,
} from '../models/taiwanNationalIdReview'

const props = defineProps<{
  file: File | null
  tourId?: string | null
}>()

const running = ref(false)
const progress = ref<TaiwanNationalIdOcrProgress>({
  stage: 'initializing',
  progress: 0,
  message: '',
})
const error = ref('')
const result = ref<TaiwanNationalIdOcrResult | null>(null)

const form = ref<TaiwanNationalIdReviewForm>({
  chineseName: '',
  nationalId: '',
  birthDate: '',
  sex: 'M',
})

const original = ref<TaiwanNationalIdReviewForm | null>(null)
const visuallyConfirmed = ref(false)
const submitting = ref(false)
const submitError = ref('')
const receipt = ref<TaiwanNationalIdReviewSaveResponse | null>(null)

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

const normalizedNationalId = computed(() =>
  form.value.nationalId.trim().toUpperCase(),
)

const idFormatValid = computed(() =>
  /^[A-Z][12]\d{8}$/.test(normalizedNationalId.value),
)

const idChecksumValid = computed(
  () =>
    idFormatValid.value &&
    validateTaiwanNationalId(normalizedNationalId.value),
)

const expectedSex = computed<'M' | 'F' | null>(() => {
  if (!idFormatValid.value) return null
  return normalizedNationalId.value[1] === '1'
    ? 'M'
    : 'F'
})

const errors = computed(() => {
  const messages: string[] = []

  if (
    !/^[\p{Script=Han}·‧ ]{2,20}$/u.test(
      form.value.chineseName.trim(),
    )
  ) {
    messages.push('中文姓名不可空白，請依身分證原圖確認。')
  }

  if (!idFormatValid.value) {
    messages.push(
      '身分證字號必須為 1 碼英文加 9 碼數字，第 2 碼為 1 或 2。',
    )
  } else if (!idChecksumValid.value) {
    messages.push('身分證字號檢查碼失敗，請重新核對。')
  }

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(form.value.birthDate)
  ) {
    messages.push('出生日期請使用 YYYY-MM-DD。')
  } else {
    const birth = new Date(
      `${form.value.birthDate}T00:00:00`,
    )
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (
      Number.isNaN(birth.getTime()) ||
      birth > today
    ) {
      messages.push('出生日期不合理，請重新確認。')
    }
  }

  if (!['M', 'F'].includes(form.value.sex)) {
    messages.push('性別尚未確認。')
  } else if (expectedSex.value && form.value.sex !== expectedSex.value) {
    messages.push(
      '性別與身分證字號第 2 碼不一致。',
    )
  }

  return messages
})

const changedFields = computed(() => {
  if (!original.value) return []

  const labels: Record<
    keyof TaiwanNationalIdReviewForm,
    string
  > = {
    chineseName: '中文姓名',
    nationalId: '身分證字號',
    birthDate: '出生日期',
    sex: '性別',
  }

  return (
    Object.keys(labels) as Array<
      keyof TaiwanNationalIdReviewForm
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
  if (!imageUrl.value) return
  URL.revokeObjectURL(imageUrl.value)
  imageUrl.value = ''
}

function normalizeName() {
  form.value.chineseName =
    form.value.chineseName
      .trim()
      .replace(/\s+/g, ' ')
}

function normalizeNationalId() {
  form.value.nationalId =
    form.value.nationalId
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 10)

  if (/^[A-Z][12]\d{8}$/.test(form.value.nationalId)) {
    form.value.sex =
      form.value.nationalId[1] === '1'
        ? 'M'
        : 'F'
  }
}

function populate(
  ocr: TaiwanNationalIdOcrResult,
) {
  form.value = {
    chineseName: ocr.chineseName,
    nationalId: ocr.nationalId,
    birthDate: ocr.birthDate,
    sex: ocr.sex,
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

async function run() {
  if (!props.file || running.value) return

  running.value = true
  error.value = ''
  receipt.value = null
  submitError.value = ''

  progress.value = {
    stage: 'initializing',
    progress: 0.03,
    message: '準備身分證辨識…',
  }

  try {
    const ocr =
      await recognizeTaiwanNationalIdWithPaddle(
        props.file,
        (next) => {
          progress.value = next
        },
      )

    result.value = ocr

    revokeImageUrl()
    imageUrl.value = URL.createObjectURL(
      ocr.orientedImage,
    )
    resetImageView()

    populate(ocr)
  } catch (err) {
    result.value = null
    error.value =
      err instanceof Error
        ? err.message
        : '身分證 OCR 執行失敗。'
  } finally {
    running.value = false
  }
}

async function save() {
  if (!canSave.value || !result.value) return

  submitting.value = true
  submitError.value = ''
  receipt.value = null

  const draft: TaiwanNationalIdReviewDraft = {
    schemaVersion: 1,
    documentType: 'tw-id',
    chineseName: form.value.chineseName.trim(),
    nationalId: normalizedNationalId.value,
    birthDate: form.value.birthDate,
    sex: form.value.sex,
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
      await saveTaiwanNationalIdReview(draft, props.tourId ?? undefined)
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
      nationalId: '',
      birthDate: '',
      sex: '',
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
  <section class="id-card">
    <div class="heading">
      <div>
        <p class="label">Step 3 · Taiwan National ID</p>
        <h2>台灣身分證辨識與人工覆核</h2>
        <p>
          PP-OCRv5 讀取中文姓名、身分證字號與出生日期；
          性別直接由身分證字號第 2 碼交叉驗證，並執行統一編號檢查碼。
        </p>
      </div>

      <span class="badge">PaddleOCR</span>
    </div>

    <button
      type="button"
      :disabled="!canRun"
      @click="run"
    >
      {{ running ? '身分證辨識中…' : '開始身分證辨識' }}
    </button>

    <div
      v-if="running"
      class="running-panel"
      aria-live="polite"
    >
      <div class="running-copy">
        <span>{{ progress.message }}</span>
        <strong>
          {{ Math.round(progress.progress * 100) }}%
        </strong>
      </div>

      <div class="running-track">
        <div
          class="running-fill"
          :style="{
            width:
              Math.max(
                4,
                Math.round(progress.progress * 100),
              ) + '%',
          }"
        ></div>
      </div>

      <small>
        系統會自動測試照片方向，必要時再做小角度校正。
      </small>
    </div>

    <p v-if="!file" class="hint">
      先在上方選擇一張台灣身分證圖片。
    </p>

    <p v-if="error" class="error">
      {{ error }}
    </p>

    <div v-if="result" class="summary">
      <div>
        <span>總辨識耗時</span>
        <strong>
          {{ (result.totalMs / 1000).toFixed(2) }} 秒
        </strong>
      </div>
      <div>
        <span>方向校正</span>
        <strong>
          {{
            Math.abs(result.rotationDegrees) < 1
              ? '原方向'
              : result.rotationDegrees.toFixed(1) + '°'
          }}
        </strong>
        <small>共測試 {{ result.orientationAttempts }} 次</small>
      </div>
      <div>
        <span>自動帶入欄位</span>
        <strong>
          {{ result.extractedFieldCount }} / 4
        </strong>
      </div>
      <div>
        <span>身分證字號檢查碼</span>
        <strong
          :class="
            result.idChecksumValid
              ? 'success'
              : 'failure'
          "
        >
          {{ result.idChecksumValid ? '通過' : '未通過' }}
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
          <h3>身分證人工覆核</h3>
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

          <p
            v-if="Math.abs(result.rotationDegrees) >= 1"
            class="orientation-note"
          >
            覆核畫面已套用 OCR 選出的方向校正；原始上傳檔沒有被修改。
          </p>

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
              alt="台灣身分證覆核圖片"
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
            <small
              v-if="
                result.fieldScores.chineseName !== null
              "
            >
              OCR 信心
              {{
                (result.fieldScores.chineseName * 100).toFixed(1)
              }}%
            </small>
          </label>

          <label class="field full">
            <span class="field-heading">
              身分證字號
              <em
                :class="
                  idChecksumValid
                    ? 'check-pass'
                    : 'check-fail'
                "
              >
                {{
                  idChecksumValid
                    ? '檢查碼通過'
                    : '檢查碼未通過'
                }}
              </em>
            </span>
            <input
              v-model="form.nationalId"
              type="text"
              maxlength="10"
              autocomplete="off"
              @input="normalizeNationalId"
            />
          </label>

          <label class="field">
            <span>出生日期</span>
            <input
              v-model="form.birthDate"
              type="date"
            />
          </label>

          <label class="field">
            <span>性別</span>
            <select v-model="form.sex">
              <option value="">未指定</option>
              <option value="M">M</option>
              <option value="F">F</option>
            </select>
            <small v-if="expectedSex">
              由身分證字號第 2 碼交叉驗證：
              {{ expectedSex }}
            </small>
          </label>

          <label class="confirmation full">
            <input
              v-model="visuallyConfirmed"
              type="checkbox"
            />
            <span>
              我已對照左側原始身分證，確認姓名、身分證字號與出生日期正確
            </span>
          </label>
        </div>
      </div>

      <div
        v-if="errors.length || changedFields.length"
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

        <div
          v-if="changedFields.length"
          class="change-box"
        >
          已人工修改：
          <strong>{{ changedFields.join('、') }}</strong>
        </div>
      </div>

      <div
        v-if="submitError"
        class="error-box submit-box"
      >
        {{ submitError }}
      </div>

      <div class="review-footer">
        <div>
          <strong
            v-if="receipt"
            class="success-text"
          >
            {{
              receipt.action === 'CreatedTravelerAndDocument'
                ? '已建立這位團員的第一筆身分證資料。'
                : receipt.action === 'CreatedDocumentVersion'
                  ? '已更新這位團員的身分證版本。'
                  : '已更新同一張身分證，沒有重複建立版本。'
            }}
          </strong>
          <span v-else>
            確認後會送到後端再次驗證身分證字號格式與檢查碼，並寫入目前團別。
          </span>

          <small v-if="receipt">
            此團員目前有
            {{ receipt.travelerDocumentVersionCount }}
            個證件版本；資料已寫入 PostgreSQL 持久化儲存。
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
      <summary>開發診斷：身分證 OCR 原始行</summary>
      <pre>{{ result.rawRows.join('\n') }}</pre>
    </details>
  </section>
</template>

<style scoped>
.id-card {
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
.image-toolbar,
.field-heading {
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
  max-width: 760px;
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
  display: grid;
  gap: 8px;
  margin-top: 14px;
  border: 1px solid #dfe4ec;
  border-radius: 12px;
  padding: 12px 14px;
  background: #f8fafc;
  color: #667085;
}

.running-copy {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.running-track {
  height: 9px;
  overflow: hidden;
  border-radius: 999px;
  background: #e9edf3;
}

.running-fill {
  height: 100%;
  border-radius: inherit;
  background: #172033;
  transition: width 180ms ease;
}

.hint,
.error {
  margin: 14px 0 0;
  color: #667085;
}

.error {
  color: #b42318;
}

.summary {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin-top: 18px;
}

.summary > div {
  border: 1px solid #e1e5ec;
  border-radius: 12px;
  padding: 12px 14px;
}

.summary span,
.summary strong,
.summary small {
  display: block;
}

.summary span,
.summary small {
  color: #667085;
  font-size: 0.78rem;
}

.summary strong {
  margin-top: 5px;
  color: #172033;
}

.summary .success,
.check-pass,
.success-text {
  color: #087443;
}

.summary .failure,
.check-fail {
  color: #b42318;
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

.orientation-note {
  margin: 0 0 8px;
  color: #667085;
  font-size: 0.76rem;
  line-height: 1.45;
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

.field-heading {
  justify-content: space-between;
  gap: 8px;
}

.field-heading em {
  font-style: normal;
  font-size: 0.74rem;
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
.change-box {
  border-radius: 12px;
  padding: 12px 14px;
  line-height: 1.55;
}

.error-box {
  background: #fff1f1;
  color: #b42318;
}

.change-box {
  background: #eef4ff;
  color: #344054;
}

.error-box ul {
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

@media (max-width: 820px) {
  .heading,
  .review-title,
  .review-footer,
  .actions {
    align-items: stretch;
    flex-direction: column;
  }

  .review-layout,
  .fields,
  .summary {
    grid-template-columns: 1fr;
  }

  .field.full,
  .confirmation.full {
    grid-column: auto;
  }
}
</style>
