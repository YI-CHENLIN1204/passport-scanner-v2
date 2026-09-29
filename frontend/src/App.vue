<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { getHealth, type HealthResponse } from './services/api'
import {
  recognizePassport,
  terminateOcrWorker,
  type OcrProgress,
  type OcrResult,
} from './services/ocr'

type DocumentType = 'passport' | 'tw-id' | 'taiwan-compatriot-permit'

const health = ref<HealthResponse | null>(null)
const error = ref('')
const loading = ref(true)

const documentType = ref<DocumentType>('passport')
const selectedFile = ref<File | null>(null)
const previewUrl = ref('')
const uploadError = ref('')

const ocrRunning = ref(false)
const ocrError = ref('')
const ocrProgress = ref<OcrProgress>({ status: '', progress: 0 })
const ocrResult = ref<OcrResult | null>(null)

const fileSummary = computed(() => {
  if (!selectedFile.value) return ''

  const sizeMb = selectedFile.value.size / 1024 / 1024
  return `${selectedFile.value.name} · ${sizeMb.toFixed(2)} MB`
})

const ocrProgressPercent = computed(() =>
  Math.round(ocrProgress.value.progress * 100),
)

const canRunPassportOcr = computed(
  () =>
    documentType.value === 'passport' &&
    selectedFile.value !== null &&
    !ocrRunning.value,
)

async function checkApi() {
  loading.value = true
  error.value = ''

  try {
    health.value = await getHealth()
  } catch (err) {
    health.value = null
    error.value = err instanceof Error ? err.message : '無法連線到 API'
  } finally {
    loading.value = false
  }
}

function resetOcrResult() {
  ocrResult.value = null
  ocrError.value = ''
  ocrProgress.value = { status: '', progress: 0 }
}

function clearPreview() {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
  }

  previewUrl.value = ''
  selectedFile.value = null
  uploadError.value = ''
  resetOcrResult()
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  clearPreview()

  if (!file) return

  if (!file.type.startsWith('image/')) {
    uploadError.value = '目前 PoC 只接受圖片檔。'
    input.value = ''
    return
  }

  const maxBytes = 15 * 1024 * 1024
  if (file.size > maxBytes) {
    uploadError.value = '圖片不可超過 15 MB。'
    input.value = ''
    return
  }

  selectedFile.value = file
  previewUrl.value = URL.createObjectURL(file)
}

async function runPassportOcr() {
  if (!selectedFile.value || documentType.value !== 'passport') return

  ocrRunning.value = true
  ocrError.value = ''
  ocrResult.value = null
  ocrProgress.value = {
    status: 'starting',
    progress: 0,
  }

  try {
    ocrResult.value = await recognizePassport(
      selectedFile.value,
      (progress) => {
        ocrProgress.value = progress
      },
    )
  } catch (err) {
    ocrError.value =
      err instanceof Error ? err.message : 'OCR 執行失敗，請查看瀏覽器 Console。'
  } finally {
    ocrRunning.value = false
  }
}

onMounted(checkApi)

onBeforeUnmount(() => {
  clearPreview()
  void terminateOcrWorker()
})
</script>

<template>
  <main class="page-shell">
    <section class="hero">
      <p class="eyebrow">Internal Tool · V2</p>
      <h1>Passport Scanner</h1>
      <p class="subtitle">
        瀏覽器端 OCR、人工覆核、旅客主檔與證件版本管理。
      </p>
    </section>

    <section class="status-card">
      <div>
        <p class="label">前後端連線狀態</p>

        <p v-if="loading" class="status">檢查中…</p>

        <p v-else-if="health" class="status success">
          API 已連線 · {{ health.service }}
        </p>

        <p v-else class="status error">
          API 未連線 · {{ error }}
        </p>
      </div>

      <button type="button" :disabled="loading" @click="checkApi">
        重新檢查
      </button>
    </section>

    <section class="scanner-card">
      <div class="section-heading">
        <div>
          <p class="label">Step 2 · Browser input</p>
          <h2>選擇證件並在瀏覽器預覽</h2>
        </div>

        <span class="local-only-badge">本機處理</span>
      </div>

      <div class="form-grid">
        <label class="field">
          <span>證件類型</span>
          <select v-model="documentType" @change="resetOcrResult">
            <option value="passport">護照</option>
            <option value="tw-id">台灣身分證</option>
            <option value="taiwan-compatriot-permit">台胞證</option>
          </select>
        </label>

        <label class="field">
          <span>證件圖片</span>
          <input
            type="file"
            accept="image/*"
            @change="handleFileChange"
          />
        </label>
      </div>

      <p class="privacy-note">
        圖片本身仍只留在瀏覽器。OCR 會在瀏覽器內的 Web Worker / WebAssembly
        執行，不會把這張證件圖片送到後端 API。
      </p>

      <p v-if="uploadError" class="inline-error">
        {{ uploadError }}
      </p>

      <div v-if="previewUrl" class="preview-layout">
        <div class="image-panel">
          <img
            :src="previewUrl"
            :alt="`${documentType} preview`"
          />
        </div>

        <div class="preview-info">
          <p class="label">已載入</p>
          <p class="file-name">{{ fileSummary }}</p>
          <p class="document-label">
            類型：
            <strong>
              {{
                documentType === 'passport'
                  ? '護照'
                  : documentType === 'tw-id'
                    ? '台灣身分證'
                    : '台胞證'
              }}
            </strong>
          </p>

          <button type="button" class="secondary-button" @click="clearPreview">
            移除圖片
          </button>
        </div>
      </div>

      <div v-else class="empty-preview">
        選擇一張證件圖片後，預覽會顯示在這裡。
      </div>
    </section>

    <section class="ocr-card">
      <div class="section-heading">
        <div>
          <p class="label">Step 3 · OCR PoC</p>
          <h2>護照 OCR 基準測試</h2>
        </div>

        <span class="poc-badge">Baseline</span>
      </div>

      <p class="section-copy">
        第一輪只測護照。Tesseract.js 是基準線，不代表最終 OCR 引擎。
        我們先測「瀏覽器能不能跑、速度多少、原始文字辨識到什麼程度」。
      </p>

      <div
        v-if="documentType !== 'passport'"
        class="notice-box"
      >
        目前 OCR PoC 先只開放護照。身分證與台胞證等護照結果評估完再加入。
      </div>

      <button
        v-else
        type="button"
        class="ocr-button"
        :disabled="!canRunPassportOcr"
        @click="runPassportOcr"
      >
        {{ ocrRunning ? '辨識中…' : '開始護照 OCR' }}
      </button>

      <div v-if="ocrRunning" class="progress-area">
        <div class="progress-meta">
          <span>{{ ocrProgress.status || 'processing' }}</span>
          <strong>{{ ocrProgressPercent }}%</strong>
        </div>
        <progress :value="ocrProgress.progress" max="1" />
        <p class="first-run-note">
          第一次執行會先載入 OCR WebAssembly 與英文模型，因此通常會比第二次慢。
        </p>
      </div>

      <p v-if="ocrError" class="inline-error">
        {{ ocrError }}
      </p>

      <div v-if="ocrResult" class="ocr-result">
        <div class="result-summary">
          <div>
            <span>本次耗時</span>
            <strong>{{ (ocrResult.elapsedMs / 1000).toFixed(2) }} 秒</strong>
          </div>
          <div>
            <span>MRZ 候選行</span>
            <strong>{{ ocrResult.mrzCandidates.length }}</strong>
          </div>
        </div>

        <div v-if="ocrResult.mrzCandidates.length" class="result-block">
          <p class="label">MRZ candidates</p>
          <pre>{{ ocrResult.mrzCandidates.join('\n') }}</pre>
        </div>

        <div class="result-block">
          <p class="label">Raw OCR text</p>
          <pre>{{ ocrResult.text || '沒有辨識到文字。' }}</pre>
        </div>
      </div>
    </section>

    <section class="next-card">
      <h2>這一輪要看的不是「一次就做到完美」</h2>
      <p>
        先記錄第一張護照的第一次與第二次辨識時間，以及 MRZ / 姓名 / 護照號碼
        是否能被辨識。這些結果會決定下一輪是先做影像前處理，還是直接比較第二個 OCR engine。
      </p>
    </section>
  </main>
</template>
