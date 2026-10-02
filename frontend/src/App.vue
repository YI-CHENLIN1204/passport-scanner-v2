<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { getHealth, type HealthResponse } from './services/api'
import PaddleBaseline from './components/PaddleBaseline.vue'
import TaiwanCompatriotPermitBaseline from './components/TaiwanCompatriotPermitBaseline.vue'
import TravelerPanel from './components/TravelerPanel.vue'
import {
  recognizePassport,
  terminateOcrWorker,
  type OcrProgress,
  type OcrResult,
} from './services/ocr'

type DocumentType = 'passport' | 'tw-id' | 'taiwan-compatriot-permit'

interface BatchTestResult {
  index: number
  elapsedMs: number
  structureComplete: boolean
  line1Length: number | null
  line2Length: number | null
  line2ChecksPassed: boolean
  line1Source: OcrResult['mrzLine1Source']
  correctedCharacters: number
  mrzAttempts: number
  selectedCropRatio: number
  error: string | null
}

const health = ref<HealthResponse | null>(null)
const activeView = ref<'scan' | 'travelers'>('scan')
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

const batchFiles = ref<File[]>([])
const batchSelectionError = ref('')
const batchRunning = ref(false)
const batchCurrent = ref(0)
const batchResults = ref<BatchTestResult[]>([])

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

const canRunBatch = computed(
  () =>
    batchFiles.value.length >= 3 &&
    batchFiles.value.length <= 5 &&
    !batchRunning.value,
)

const batchPassCount = computed(
  () =>
    batchResults.value.filter(
      (result) => result.structureComplete && result.line2ChecksPassed,
    ).length,
)

const batchAverageSeconds = computed(() => {
  if (!batchResults.value.length) return 0

  const completed = batchResults.value.filter((result) => !result.error)
  if (!completed.length) return 0

  return (
    completed.reduce((sum, result) => sum + result.elapsedMs, 0) /
    completed.length /
    1000
  )
})

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
    uploadError.value = '目前只接受圖片檔。'
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

function handleBatchFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])

  batchSelectionError.value = ''
  batchResults.value = []

  const validFiles = files.filter(
    (file) => file.type.startsWith('image/') && file.size <= 15 * 1024 * 1024,
  )

  if (validFiles.length !== files.length) {
    batchSelectionError.value =
      '已忽略非圖片或超過 15 MB 的檔案。'
  }

  batchFiles.value = validFiles.slice(0, 5)

  if (validFiles.length > 5) {
    batchSelectionError.value = '泛化測試一次最多 5 張，已取前 5 張。'
  } else if (batchFiles.value.length > 0 && batchFiles.value.length < 3) {
    batchSelectionError.value = '請選 3～5 張不同拍攝條件的護照圖片。'
  }
}

async function runBatchTests() {
  if (!canRunBatch.value) return

  batchRunning.value = true
  batchCurrent.value = 0
  batchResults.value = []

  try {
    for (let index = 0; index < batchFiles.value.length; index += 1) {
      batchCurrent.value = index + 1

      try {
        const result = await recognizePassport(batchFiles.value[index])

        batchResults.value.push({
          index: index + 1,
          elapsedMs: result.elapsedMs,
          structureComplete: result.parsedMrz !== null,
          line1Length: result.mrzLine1?.length ?? null,
          line2Length: result.mrzLine2?.length ?? null,
          line2ChecksPassed:
            result.line2Validation?.requiredValid === true,
          line1Source: result.mrzLine1Source,
          correctedCharacters: result.mrzRepair?.correctedCharacters ?? 0,
          mrzAttempts: result.mrzAttempts,
          selectedCropRatio: result.selectedCropRatio,
          error: null,
        })
      } catch (err) {
        batchResults.value.push({
          index: index + 1,
          elapsedMs: 0,
          structureComplete: false,
          line1Length: null,
          line2Length: null,
          line2ChecksPassed: false,
          line1Source: null,
          correctedCharacters: 0,
          mrzAttempts: 0,
          selectedCropRatio: 0,
          error: err instanceof Error ? err.message : '辨識失敗',
        })
      }
    }
  } finally {
    batchRunning.value = false
    batchCurrent.value = 0
  }
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
      <h1>證件掃描系統</h1>
      <p class="subtitle">
        瀏覽器端證件辨識、人工覆核與後續旅客資料流程。
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

    <nav class="workspace-nav" aria-label="主要功能">
      <button
        type="button"
        :class="{ active: activeView === 'scan' }"
        @click="activeView = 'scan'"
      >
        證件掃描
      </button>
      <button
        type="button"
        :class="{ active: activeView === 'travelers' }"
        @click="activeView = 'travelers'"
      >
        旅客資料
      </button>
    </nav>

    <TravelerPanel v-if="activeView === 'travelers'" />

    <section
      v-if="activeView === 'scan'"
      class="scanner-card"
    >
      <div class="section-heading">
        <div>
          <p class="label">Step 2 · Document input</p>
          <h2>選擇證件圖片</h2>
        </div>

        <span class="local-only-badge">本機處理</span>
      </div>

      <div class="form-grid">
        <label class="field">
          <span>證件類型</span>
          <select v-model="documentType" @change="resetOcrResult">
            <option value="passport">護照</option>
            <option value="taiwan-compatriot-permit">台胞證</option>
            <option value="tw-id">台灣身分證（暫緩）</option>
          </select>
        </label>

        <label class="field">
          <span>
            證件圖片
          </span>
          <input
            type="file"
            accept="image/*"
            @change="handleFileChange"
          />
        </label>
      </div>

      <p class="privacy-note">
        證件圖片只在瀏覽器內預覽與辨識，不會為了辨識而把原始圖片送到後端 API。
        <template v-if="documentType === 'taiwan-compatriot-permit'">
          正面或背面皆可；系統會依影像內容自動選擇 VIZ OCR 或機讀碼。
        </template>
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

    <PaddleBaseline
      v-if="
        activeView === 'scan' &&
        documentType === 'passport'
      "
      :file="selectedFile"
    />

    <TaiwanCompatriotPermitBaseline
      v-else-if="
        activeView === 'scan' &&
        documentType === 'taiwan-compatriot-permit'
      "
      :file="selectedFile"
    />

    <section
      v-else-if="activeView === 'scan'"
      class="notice-box unsupported-document-card"
    >
      <strong>台灣身分證 OCR 目前暫緩。</strong>
      <span>
        先把護照、台胞證、後端證件版本管理與正式操作介面做完整。
        身分證需要更高比例的中文欄位 OCR 與身分證字號檢查碼測試，之後再獨立處理。
      </span>
    </section>

    <details
      v-if="activeView === 'scan'"
      class="dev-lab"
    >
      <summary>
        開發測試工具：Tesseract Baseline A 與舊泛化測試
      </summary>

      <div class="dev-lab-body">
<section class="ocr-card">
      <div class="section-heading">
        <div>
          <p class="label">Developer benchmark · Tesseract</p>
          <h2>Tesseract 護照基準測試</h2>
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
              {{ ocrResult.parsedMrz ? '結構完成' : '尚未完成' }}
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

          <p v-if="ocrResult.mrzRepair" class="repair-note">
            已依 MRZ 欄位格式與 check digit 唯一解，自動修正
            <strong>{{ ocrResult.mrzRepair.correctedCharacters }}</strong>
            個疑似 OCR 混淆字元；若無唯一解則不會自動修改。
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
            · 姓名：
            <strong>仍需人工覆核</strong>
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
          MRZ 前處理 {{ (ocrResult.preprocessingMs / 1000).toFixed(2) }} 秒 ·
          MRZ 嘗試 {{ ocrResult.mrzAttempts }} 次 ·
          最終裁切底部 {{ Math.round(ocrResult.selectedCropRatio * 100) }}%
        </p>
      </div>
    </section>
<section class="batch-card">
      <div class="section-heading">
        <div>
          <p class="label">Step 4 · Generalization test</p>
          <h2>3～5 張護照批次泛化測試</h2>
        </div>

        <span class="local-only-badge">只在瀏覽器處理</span>
      </div>

      <p class="section-copy">
        不再針對同一張護照調參數。請改選 3～5 張不同拍攝條件、不同護照持有人的測試圖片。
        系統只顯示測試編號、速度、MRZ 結構與檢查碼結果，不在摘要中顯示姓名或護照號碼。
      </p>

      <label class="field">
        <span>批次測試圖片（3～5 張）</span>
        <input
          type="file"
          accept="image/*"
          multiple
          :disabled="batchRunning"
          @change="handleBatchFiles"
        />
      </label>

      <p v-if="batchSelectionError" class="inline-error">
        {{ batchSelectionError }}
      </p>

      <div class="batch-actions">
        <span>
          已選 {{ batchFiles.length }} 張
          <template v-if="batchRunning">
            · 正在處理第 {{ batchCurrent }} / {{ batchFiles.length }} 張
          </template>
        </span>

        <button
          type="button"
          :disabled="!canRunBatch"
          @click="runBatchTests"
        >
          {{ batchRunning ? '批次測試中…' : '開始批次測試' }}
        </button>
      </div>

      <div v-if="batchResults.length" class="batch-summary">
        <div>
          <span>完整通過</span>
          <strong>{{ batchPassCount }} / {{ batchResults.length }}</strong>
        </div>
        <div>
          <span>平均耗時</span>
          <strong>{{ batchAverageSeconds.toFixed(2) }} 秒</strong>
        </div>
      </div>

      <div v-if="batchResults.length" class="batch-results">
        <article
          v-for="result in batchResults"
          :key="result.index"
          class="batch-result-card"
        >
          <div class="batch-result-heading">
            <strong>測試 {{ result.index }}</strong>
            <span
              :class="
                result.structureComplete && result.line2ChecksPassed
                  ? 'validation-pass'
                  : 'validation-fail'
              "
            >
              {{
                result.structureComplete && result.line2ChecksPassed
                  ? '通過'
                  : '需人工確認'
              }}
            </span>
          </div>

          <dl>
            <div>
              <dt>耗時</dt>
              <dd>
                {{ result.error ? '失敗' : (result.elapsedMs / 1000).toFixed(2) + ' 秒' }}
              </dd>
            </div>
            <div>
              <dt>Line 1 / Line 2</dt>
              <dd>
                {{ result.line1Length ?? '無' }} / {{ result.line2Length ?? '無' }}
              </dd>
            </div>
            <div>
              <dt>Line 2 檢查碼</dt>
              <dd>
                {{ result.line2ChecksPassed ? '全部通過' : '未全部通過' }}
              </dd>
            </div>
            <div>
              <dt>Line 1 來源</dt>
              <dd>
                {{
                  result.line1Source === 'dedicated'
                    ? 'MRZ 專用 OCR'
                    : result.line1Source === 'full-page'
                      ? '整頁 OCR fallback'
                      : '無'
                }}
              </dd>
            </div>
            <div>
              <dt>受限自動修正</dt>
              <dd>
                {{ result.correctedCharacters > 0 ? result.correctedCharacters + ' 字元' : '無' }}
              </dd>
            </div>
            <div>
              <dt>MRZ 嘗試</dt>
              <dd>{{ result.mrzAttempts }} 次</dd>
            </div>
            <div>
              <dt>最終裁切</dt>
              <dd>
                {{ result.selectedCropRatio > 0 ? Math.round(result.selectedCropRatio * 100) + '%' : '無' }}
              </dd>
            </div>
          </dl>

          <p v-if="result.error" class="inline-error">
            {{ result.error }}
          </p>
        </article>
      </div>
    </section>
      </div>
    </details>
  </main>
</template>
