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
const mrzCropUrl = ref('')

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

const mrzCandidateLengths = computed(() =>
  [
    ocrResult.value?.mrzLine1?.length ?? null,
    ocrResult.value?.mrzLine2?.length ?? null,
  ]
    .map((length) => length ?? '無')
    .join(' / '),
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

function revokeMrzCrop() {
  if (mrzCropUrl.value) {
    URL.revokeObjectURL(mrzCropUrl.value)
    mrzCropUrl.value = ''
  }
}

function resetOcrResult() {
  revokeMrzCrop()
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

function validationText(value: boolean | null) {
  if (value === true) return '通過'
  if (value === false) return '失敗'
  return '未驗證'
}

function validationClass(value: boolean | null) {
  if (value === true) return 'validation-pass'
  if (value === false) return 'validation-fail'
  return 'validation-unknown'
}

async function runPassportOcr() {
  if (!selectedFile.value || documentType.value !== 'passport') return

  ocrRunning.value = true
  ocrError.value = ''
  resetOcrResult()
  ocrProgress.value = {
    status: 'starting',
    progress: 0,
  }

  try {
    const result = await recognizePassport(
      selectedFile.value,
      (progress) => {
        ocrProgress.value = progress
      },
    )

    ocrResult.value = result
    mrzCropUrl.value = URL.createObjectURL(result.mrzCrop)
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
          <h2>護照 OCR + MRZ 專用辨識</h2>
        </div>

        <span class="poc-badge">Baseline A</span>
      </div>

      <p class="section-copy">
        現在會先做整頁 OCR，再自動裁切護照底部做第二次 MRZ 專用 OCR。
        MRZ 通過 2 × 44 格式後，再用 TD3 check digit 驗證關鍵欄位。
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
          第一次執行會先載入 OCR WebAssembly 與英文模型；之後同一頁面會重用 worker。
        </p>
      </div>

      <p v-if="ocrError" class="inline-error">
        {{ ocrError }}
      </p>

      <div v-if="ocrResult" class="ocr-result">
        <div class="result-summary four-columns">
          <div>
            <span>總耗時</span>
            <strong>{{ (ocrResult.elapsedMs / 1000).toFixed(2) }} 秒</strong>
          </div>
          <div>
            <span>整頁 OCR</span>
            <strong>{{ (ocrResult.fullPageMs / 1000).toFixed(2) }} 秒</strong>
          </div>
          <div>
            <span>MRZ 專用 OCR</span>
            <strong>{{ (ocrResult.mrzPassMs / 1000).toFixed(2) }} 秒</strong>
          </div>
          <div>
            <span>TD3 2 × 44</span>
            <strong :class="ocrResult.parsedMrz ? 'success' : 'error'">
              {{ ocrResult.parsedMrz ? '格式通過' : '尚未通過' }}
            </strong>
          </div>
        </div>

        <div v-if="ocrResult.line2Validation" class="validation-panel">
          <div class="validation-heading">
            <div>
              <p class="label">MRZ line 2 check digits</p>
              <h3>
                {{
                  ocrResult.line2Validation.requiredValid
                    ? '第二行關鍵檢查碼全部通過'
                    : '第二行仍有檢查碼失敗'
                }}
              </h3>
            </div>

            <span
              class="validation-overall"
              :class="
                ocrResult.line2Validation.requiredValid
                  ? 'validation-pass'
                  : 'validation-fail'
              "
            >
              {{
                ocrResult.line2Validation.requiredValid
                  ? '關鍵欄位可信度高'
                  : '需要人工確認'
              }}
            </span>
          </div>

          <div class="validation-grid">
            <div>
              <span>護照號碼</span>
              <strong
                :class="validationClass(ocrResult.line2Validation.documentNumber)"
              >
                {{ validationText(ocrResult.line2Validation.documentNumber) }}
              </strong>
            </div>
            <div>
              <span>出生日期</span>
              <strong
                :class="validationClass(ocrResult.line2Validation.birthDate)"
              >
                {{ validationText(ocrResult.line2Validation.birthDate) }}
              </strong>
            </div>
            <div>
              <span>有效期限</span>
              <strong
                :class="validationClass(ocrResult.line2Validation.expiryDate)"
              >
                {{ validationText(ocrResult.line2Validation.expiryDate) }}
              </strong>
            </div>
            <div>
              <span>整體檢查碼</span>
              <strong
                :class="validationClass(ocrResult.line2Validation.composite)"
              >
                {{ validationText(ocrResult.line2Validation.composite) }}
              </strong>
            </div>
          </div>

          <p class="validation-note">
            第二行可以獨立驗證，所以護照號碼、生日與有效期限可以先建立高可信度。
            第一行姓名若由整頁 OCR fallback 補回，仍必須保留人工覆核。
          </p>

          <p v-if="ocrResult.mrzLine1" class="timing-note">
            Line 1 來源：
            <strong>
              {{
                ocrResult.mrzLine1Source === 'dedicated'
                  ? 'MRZ 專用 OCR'
                  : ocrResult.mrzLine1Source === 'full-page'
                    ? '整頁 OCR fallback'
                    : '未知'
              }}
            </strong>
            · Line 1 / Line 2 長度：
            <strong>{{ ocrResult.mrzLine1.length }} / {{ ocrResult.mrzLine2?.length ?? '無' }}</strong>
          </p>
        </div>

        <div v-if="!ocrResult.parsedMrz" class="format-warning">
          <strong>MRZ 尚未形成完整可解析的 2 × 44 字元。</strong>
          <span>
            MRZ 行長度（Line 1 / Line 2）：{{ mrzCandidateLengths }}。
          </span>
        </div>

        <details class="debug-details">
          <summary>查看 MRZ 裁切預覽（含敏感證件內容）</summary>
          <div class="mrz-preview" v-if="mrzCropUrl">
            <img :src="mrzCropUrl" alt="MRZ crop preview" />
          </div>
        </details>

        <details class="debug-details">
          <summary>查看 MRZ OCR 原始文字（含敏感資料）</summary>
          <div class="result-block details-block">
            <p class="label">MRZ dedicated OCR</p>
            <pre>{{ ocrResult.mrzText || '沒有辨識到 MRZ 文字。' }}</pre>
          </div>
        </details>

        <details class="debug-details">
          <summary>查看整頁 Raw OCR（含敏感資料）</summary>
          <div class="result-block details-block">
            <p class="label">Raw OCR text</p>
            <pre>{{ ocrResult.text || '沒有辨識到文字。' }}</pre>
          </div>
        </details>

        <p class="timing-note">
          初始化 {{ (ocrResult.initializationMs / 1000).toFixed(2) }} 秒 ·
          MRZ 前處理 {{ (ocrResult.preprocessingMs / 1000).toFixed(2) }} 秒
        </p>
      </div>
    </section>

    <section class="next-card">
      <h2>下一輪只看兩件事</h2>
      <p>
        第一，看 MRZ 是否能穩定形成 2 × 44；第二，看護照號碼、生日、有效期限與整體
        check digit 能不能全部通過。只有格式與檢查碼穩定之後，才值得進一步做欄位入庫。
      </p>
    </section>
  </main>
</template>
