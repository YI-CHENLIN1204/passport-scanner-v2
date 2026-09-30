<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  recognizePassportWithPaddle,
  type PaddleBaselineResult,
} from '../services/paddleOcr'

const props = defineProps<{
  file: File | null
}>()

const running = ref(false)
const error = ref('')
const result = ref<PaddleBaselineResult | null>(null)

const canRun = computed(() => props.file !== null && !running.value)

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
  .checks {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .summary,
  .checks {
    grid-template-columns: 1fr;
  }
}
</style>
