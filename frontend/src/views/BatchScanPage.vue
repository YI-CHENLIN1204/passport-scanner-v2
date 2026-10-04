<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  addScanItem,
  createScanBatch,
  getTourDetail,
  listTours,
  type CreateScanItemRequest,
  type TourDetailResponse,
  type TourSummaryResponse,
} from '../services/api'
import {
  recognizePassportWithPaddle,
  recognizeTaiwanCompatriotPermitWithPaddle,
  recognizeTaiwanNationalIdWithPaddle,
} from '../services/paddleOcr'

const props = defineProps<{
  tourId?: string | null
}>()

const emit = defineEmits<{
  navigate: [path: string]
}>()

interface BatchFileState {
  file: File
  status: 'queued' | 'processing' | 'done' | 'error'
  message: string
}

const tours = ref<TourSummaryResponse[]>([])
const selectedTourId = ref(props.tourId ?? '')
const detail = ref<TourDetailResponse | null>(null)
const documentType = ref('')
const files = ref<BatchFileState[]>([])
const loading = ref(true)
const running = ref(false)
const error = ref('')
const progressMessage = ref('')
const completedCount = ref(0)

const selectedTour = computed(() =>
  tours.value.find(tour => tour.tourId === selectedTourId.value) ?? null,
)

const availableDocumentTypes = computed(() =>
  detail.value?.tour.requiredDocumentTypes ?? [],
)

const progressPercent = computed(() => {
  if (!files.value.length) return 0
  return Math.round(
    (completedCount.value / files.value.length) * 100,
  )
})

function documentLabel(type: string) {
  if (type === 'PASSPORT') return '護照'
  if (type === 'TAIWAN_COMPATRIOT_PERMIT') return '台胞證'
  if (type === 'TAIWAN_NATIONAL_ID') return '身分證'
  return type
}

function formatIsoDate(
  year: number,
  month: number,
  day: number,
) {
  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-')
}

function mrzBirthDateToIso(value: string) {
  if (!/^\d{6}$/.test(value)) return null

  const yy = Number(value.slice(0, 2))
  const month = Number(value.slice(2, 4))
  const day = Number(value.slice(4, 6))
  const currentYear = new Date().getUTCFullYear()
  const currentTwoDigits = currentYear % 100
  const year =
    yy <= currentTwoDigits
      ? 2000 + yy
      : 1900 + yy

  return formatIsoDate(year, month, day)
}

function mrzExpiryDateToIso(value: string) {
  if (!/^\d{6}$/.test(value)) return null

  const yy = Number(value.slice(0, 2))
  const month = Number(value.slice(2, 4))
  const day = Number(value.slice(4, 6))
  const currentYear = new Date().getUTCFullYear()
  const currentCentury = Math.floor(currentYear / 100) * 100
  let year = currentCentury + yy

  if (year < currentYear - 20) {
    year += 100
  }

  return formatIsoDate(year, month, day)
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      const value =
        typeof reader.result === 'string'
          ? reader.result
          : ''
      const comma = value.indexOf(',')

      if (comma < 0) {
        reject(new Error('圖片轉換失敗。'))
        return
      }

      resolve(value.slice(comma + 1))
    }

    reader.onerror = () =>
      reject(new Error('圖片讀取失敗。'))

    reader.readAsDataURL(file)
  })
}

async function loadTour(tourId: string) {
  detail.value = null
  documentType.value = ''
  files.value = []
  completedCount.value = 0

  if (!tourId) return

  const loaded = await getTourDetail(tourId)
  detail.value = loaded

  if (loaded?.tour.requiredDocumentTypes.length) {
    documentType.value =
      loaded.tour.requiredDocumentTypes[0]
  }
}

async function load() {
  loading.value = true
  error.value = ''

  try {
    tours.value = await listTours('')

    if (
      selectedTourId.value &&
      !tours.value.some(
        tour => tour.tourId === selectedTourId.value,
      )
    ) {
      selectedTourId.value = ''
    }

    if (!selectedTourId.value && tours.value.length) {
      selectedTourId.value = tours.value[0].tourId
    }

    if (selectedTourId.value) {
      await loadTour(selectedTourId.value)
    }
  } catch (err) {
    error.value =
      err instanceof Error
        ? err.message
        : '掃描工作區載入失敗。'
  } finally {
    loading.value = false
  }
}

function chooseFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const chosen = Array.from(input.files ?? [])

  error.value = ''
  completedCount.value = 0

  const valid = chosen.filter(file =>
    file.type.startsWith('image/') &&
    file.size <= 15 * 1024 * 1024,
  )

  if (valid.length !== chosen.length) {
    error.value =
      '已忽略非圖片或超過 15 MB 的檔案。'
  }

  files.value = valid.map(file => ({
    file,
    status: 'queued',
    message: '等待辨識',
  }))
}

async function buildPassportItem(
  file: File,
): Promise<CreateScanItemRequest> {
  const result = await recognizePassportWithPaddle(
    file,
    progress => {
      progressMessage.value = progress.message
    },
  )

  const parsed = result.parsedMrz
  const reviewImage = result.orientedImage ?? file
  const imageBase64 = await fileToBase64(reviewImage)

  return {
    originalFileName: file.name,
    imageContentType: reviewImage.type || file.type || 'image/jpeg',
    imageBase64,
    nameZh: result.chineseName ?? '',
    nameEn: parsed
      ? [parsed.surname, parsed.givenNames]
          .filter(Boolean)
          .join(', ')
      : '',
    birthDate: parsed
      ? mrzBirthDateToIso(parsed.birthDate)
      : null,
    gender: parsed?.sex ?? '',
    nationality: parsed?.nationality ?? null,
    documentNumber: parsed?.documentNumber ?? '',
    issuingCountry: parsed?.issuingState ?? null,
    expiryDate: parsed
      ? mrzExpiryDateToIso(parsed.expiryDate)
      : null,
    ocrPayloadJson: JSON.stringify({
      engine: 'PaddleOCR',
      structureComplete: result.structureComplete,
      line1Valid: result.line1Valid,
      rotationDegrees: result.rotationDegrees ?? 0,
      detectedItems: result.detectedItems,
      averageScore: result.averageScore,
    }),
  }
}

async function buildPermitItem(
  file: File,
): Promise<CreateScanItemRequest> {
  const result =
    await recognizeTaiwanCompatriotPermitWithPaddle(
      file,
      progress => {
        progressMessage.value = progress.message
      },
    )

  const reviewImage = result.orientedImage ?? file
  const imageBase64 = await fileToBase64(reviewImage)

  return {
    originalFileName: file.name,
    imageContentType: reviewImage.type || file.type || 'image/jpeg',
    imageBase64,
    nameZh: result.chineseName,
    nameEn: '',
    birthDate: result.birthDate || null,
    gender: result.sex,
    nationality: null,
    documentNumber: result.permitNumber,
    issuingCountry: null,
    expiryDate: result.expiryDate || null,
    ocrPayloadJson: JSON.stringify({
      engine: 'PaddleOCR',
      mrzUsed: result.mrzUsed,
      rotationDegrees: result.rotationDegrees,
      detectedItems: result.detectedItems,
      averageScore: result.averageScore,
    }),
  }
}

async function buildNationalIdItem(
  file: File,
): Promise<CreateScanItemRequest> {
  const result =
    await recognizeTaiwanNationalIdWithPaddle(
      file,
      progress => {
        progressMessage.value = progress.message
      },
    )

  const reviewImage = result.orientedImage ?? file
  const imageBase64 = await fileToBase64(reviewImage)

  return {
    originalFileName: file.name,
    imageContentType: reviewImage.type || file.type || 'image/jpeg',
    imageBase64,
    nameZh: result.chineseName,
    nameEn: '',
    birthDate: result.birthDate || null,
    gender: result.sex,
    nationality: 'TWN',
    documentNumber: result.nationalId,
    issuingCountry: 'TWN',
    expiryDate: null,
    ocrPayloadJson: JSON.stringify({
      engine: 'PaddleOCR',
      idChecksumValid: result.idChecksumValid,
      rotationDegrees: result.rotationDegrees,
      detectedItems: result.detectedItems,
      averageScore: result.averageScore,
    }),
  }
}

async function buildScanItem(
  file: File,
) {
  if (documentType.value === 'PASSPORT') {
    return buildPassportItem(file)
  }

  if (
    documentType.value ===
    'TAIWAN_COMPATRIOT_PERMIT'
  ) {
    return buildPermitItem(file)
  }

  if (documentType.value === 'TAIWAN_NATIONAL_ID') {
    return buildNationalIdItem(file)
  }

  throw new Error('尚未選擇證件類型。')
}

async function runBatch() {
  if (
    running.value ||
    !selectedTourId.value ||
    !documentType.value ||
    !files.value.length
  ) {
    return
  }

  running.value = true
  error.value = ''
  completedCount.value = 0

  try {
    const batch = await createScanBatch(
      selectedTourId.value,
      documentType.value,
    )

    for (let index = 0; index < files.value.length; index += 1) {
      const item = files.value[index]
      item.status = 'processing'
      item.message =
        `正在辨識 ${index + 1} / ${files.value.length}`
      progressMessage.value = item.message

      try {
        const request = await buildScanItem(item.file)
        await addScanItem(batch.scanBatchId, request)
        item.status = 'done'
        item.message = '已加入待審核'
      } catch (err) {
        item.status = 'error'
        item.message =
          err instanceof Error
            ? err.message
            : '辨識失敗'
      } finally {
        completedCount.value = index + 1
      }
    }

    progressMessage.value = '批次辨識完成。'
  } catch (err) {
    error.value =
      err instanceof Error
        ? err.message
        : '批次掃描建立失敗。'
  } finally {
    running.value = false
  }
}

watch(
  () => selectedTourId.value,
  async (tourId, previous) => {
    if (!tourId || tourId === previous) return

    try {
      await loadTour(tourId)
    } catch (err) {
      error.value =
        err instanceof Error
          ? err.message
          : '團別資料載入失敗。'
    }
  },
)

onMounted(load)
</script>

<template>
  <section class="page">
    <header class="page-header">
      <div>
        <p class="page-kicker">BATCH SCAN</p>
        <h1>證件掃描</h1>
        <p>
          一次上傳同類型證件，OCR 完成後直接加入團別待審核清單。
        </p>
      </div>

      <button
        v-if="selectedTourId"
        type="button"
        class="secondary-action"
        @click="emit('navigate', `/tours/${selectedTourId}`)"
      >
        查看團別
      </button>
    </header>

    <p v-if="error" class="error-message">{{ error }}</p>

    <div v-if="loading" class="state-card">
      正在準備掃描工作區…
    </div>

    <template v-else>
      <section class="setup-card">
        <div class="setup-grid">
          <label>
            <span>團別</span>
            <select
              v-model="selectedTourId"
              :disabled="running"
            >
              <option value="" disabled>選擇團別</option>
              <option
                v-for="tour in tours"
                :key="tour.tourId"
                :value="tour.tourId"
              >
                {{ tour.tourName }}
                · {{ tour.departureDate }}
              </option>
            </select>
          </label>

          <label>
            <span>本批證件類型</span>
            <select
              v-model="documentType"
              :disabled="running || !detail"
            >
              <option value="" disabled>選擇證件</option>
              <option
                v-for="type in availableDocumentTypes"
                :key="type"
                :value="type"
              >
                {{ documentLabel(type) }}
              </option>
            </select>
          </label>
        </div>

        <div
          v-if="selectedTour"
          class="tour-context"
        >
          <strong>{{ selectedTour.tourName }}</strong>
          <span>
            此團只接受：
            {{
              availableDocumentTypes
                .map(documentLabel)
                .join('、')
            }}
          </span>
        </div>
      </section>

      <section class="upload-card">
        <div class="upload-heading">
          <div>
            <h2>批次上傳</h2>
            <p>
              請一次選擇同一種證件。護照、身分證、台胞證可分不同批次上傳。
            </p>
          </div>

          <label class="file-button">
            選擇多張圖片
            <input
              type="file"
              accept="image/*"
              multiple
              :disabled="running || !documentType"
              @change="chooseFiles"
            />
          </label>
        </div>

        <div v-if="files.length" class="batch-summary">
          <span>已選 {{ files.length }} 張</span>
          <span>
            {{ completedCount }} / {{ files.length }}
          </span>
        </div>

        <progress
          v-if="running || completedCount"
          :value="progressPercent"
          max="100"
        ></progress>

        <p
          v-if="progressMessage"
          class="progress-message"
        >
          {{ progressMessage }}
        </p>

        <div v-if="files.length" class="file-list">
          <div
            v-for="(item, index) in files"
            :key="`${item.file.name}-${index}`"
            class="file-row"
          >
            <div>
              <strong>{{ item.file.name }}</strong>
              <span>
                {{ (item.file.size / 1024 / 1024).toFixed(2) }} MB
              </span>
            </div>

            <span
              class="file-status"
              :class="item.status"
            >
              {{
                item.status === 'queued'
                  ? '等待'
                  : item.status === 'processing'
                    ? '辨識中'
                    : item.status === 'done'
                      ? '已加入待審核'
                      : '失敗'
              }}
            </span>

            <small v-if="item.status === 'error'">
              {{ item.message }}
            </small>
          </div>
        </div>

        <div v-else class="drop-state">
          <strong>尚未選擇圖片</strong>
          <span>
            單張上限 15 MB；OCR 會依序在瀏覽器中處理。
          </span>
        </div>

        <footer class="upload-footer">
          <span>
            不需要在這裡逐張確認；完成後可回團別頁統一審核。
          </span>
          <button
            type="button"
            class="primary-action"
            :disabled="
              running ||
              !selectedTourId ||
              !documentType ||
              !files.length
            "
            @click="runBatch"
          >
            {{
              running
                ? `辨識中 ${progressPercent}%`
                : `開始辨識 ${files.length || ''} 張`
            }}
          </button>
        </footer>
      </section>
    </template>
  </section>
</template>

<style scoped>
.page {
  display: grid;
  gap: 22px;
}

.page-header {
  display: flex;
  gap: 24px;
  align-items: flex-start;
  justify-content: space-between;
}

.page-header h1 {
  margin: 2px 0 6px;
  color: #172033;
  font-size: 30px;
}

.page-header p:not(.page-kicker) {
  margin: 0;
  color: #6b7689;
}

.page-kicker {
  margin: 0;
  color: #7a879c;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .12em;
}

.setup-card,
.upload-card {
  padding: 20px;
  border: 1px solid #dce3ed;
  border-radius: 16px;
  background: #fff;
}

.setup-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.setup-grid label {
  display: grid;
  gap: 6px;
  color: #425067;
  font-size: 12px;
  font-weight: 700;
}

.setup-grid select {
  min-height: 44px;
  padding: 0 11px;
  border: 1px solid #cfd8e5;
  border-radius: 10px;
  background: #fff;
  font: inherit;
}

.tour-context {
  display: flex;
  gap: 10px;
  align-items: baseline;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid #edf1f5;
}

.tour-context span {
  color: #748095;
  font-size: 12px;
}

.upload-card {
  display: grid;
  gap: 16px;
}

.upload-heading {
  display: flex;
  gap: 20px;
  align-items: flex-start;
  justify-content: space-between;
}

.upload-heading h2 {
  margin: 0 0 5px;
  color: #172033;
  font-size: 18px;
}

.upload-heading p {
  margin: 0;
  color: #748095;
  font-size: 12px;
}

.file-button,
.primary-action,
.secondary-action {
  border-radius: 10px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.file-button {
  display: inline-flex;
  align-items: center;
  min-height: 42px;
  padding: 0 15px;
  background: #eef2f7;
  color: #334258;
}

.file-button input {
  display: none;
}

.primary-action {
  min-height: 42px;
  padding: 0 16px;
  border: 0;
  background: #172033;
  color: #fff;
}

.secondary-action {
  min-height: 42px;
  padding: 0 15px;
  border: 1px solid #d4dce7;
  background: #fff;
  color: #26334a;
}

.batch-summary {
  display: flex;
  justify-content: space-between;
  color: #5f6d82;
  font-size: 12px;
}

progress {
  width: 100%;
  height: 9px;
}

.progress-message {
  margin: -7px 0 0;
  color: #6c788b;
  font-size: 12px;
}

.file-list {
  display: grid;
  border: 1px solid #e1e7ef;
  border-radius: 12px;
  overflow: hidden;
}

.file-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px 12px;
  align-items: center;
  padding: 11px 13px;
  border-bottom: 1px solid #edf1f5;
}

.file-row:last-child {
  border-bottom: 0;
}

.file-row > div {
  display: grid;
  gap: 2px;
}

.file-row strong {
  overflow: hidden;
  color: #28354a;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-row span,
.file-row small {
  color: #7b8799;
  font-size: 11px;
}

.file-row small {
  grid-column: 1 / -1;
  color: #b53a31;
}

.file-status {
  padding: 4px 8px;
  border-radius: 999px;
  background: #f0f3f6;
  font-weight: 700;
}

.file-status.processing {
  background: #fff4dc;
  color: #926313;
}

.file-status.done {
  background: #eaf7ef;
  color: #237447;
}

.file-status.error {
  background: #fdeceb;
  color: #ad352d;
}

.drop-state,
.state-card {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 5px;
  min-height: 230px;
  border: 1px dashed #d6deea;
  border-radius: 13px;
  color: #7a8698;
  text-align: center;
}

.drop-state span {
  font-size: 12px;
}

.upload-footer {
  display: flex;
  gap: 20px;
  align-items: center;
  justify-content: space-between;
  padding-top: 4px;
}

.upload-footer > span {
  color: #778397;
  font-size: 12px;
}

.error-message {
  color: #bd3328;
}

button:disabled,
.file-button:has(input:disabled) {
  cursor: not-allowed;
  opacity: .5;
}

@media (max-width: 720px) {
  .page-header,
  .upload-heading,
  .upload-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .setup-grid {
    grid-template-columns: 1fr;
  }
}
</style>
