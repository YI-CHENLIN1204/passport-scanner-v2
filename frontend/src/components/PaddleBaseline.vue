<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  recognizePassportWithPaddle,
  recognizePassportsWithPaddle,
  type PaddleBaselineResult,
} from '../services/paddleOcr'

const props = defineProps<{
  file: File | null
}>()

const running = ref(false)
const error = ref('')
const result = ref<PaddleBaselineResult | null>(null)

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
  error: string | null
}

const batchFiles = ref<File[]>([])
const batchError = ref('')
const batchRunning = ref(false)
const batchCurrent = ref(0)
const batchResults = ref<PaddleBatchResult[]>([])

const canRun = computed(() => props.file !== null && !running.value)

const canRunBatch = computed(
  () =>
    batchFiles.value.length >= 3 &&
    batchFiles.value.length <= 5 &&
    !batchRunning.value,
)

const batchPassCount = computed(
  () =>
    batchResults.value.filter(
      (item) => item.structureComplete && item.line2ChecksPassed,
    ).length,
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

  try {
    const results = await recognizePassportsWithPaddle(batchFiles.value)

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
      error: null,
    }))
  } catch (err) {
    batchError.value =
      err instanceof Error
        ? err.message
        : 'PaddleOCR 批次辨識失敗。'
  } finally {
    batchRunning.value = false
    batchCurrent.value = 0
  }
}

async function run() {
  if (!props.file || running.value) return

  running.value = true
  error.value = ''
  result.value = null

  try {
    result.value = await recognizePassportWithPaddle(props.file)
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

    <p v-if="error" class="error">
      {{ error }}
    </p>

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
          · 正在以單次批次推論處理 {{ batchFiles.length }} 張
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
  .validation-title {
    flex-direction: column;
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

  .batch-actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
