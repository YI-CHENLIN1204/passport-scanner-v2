<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  downloadTrainingDataset,
  getOcrBenchmarkSummary,
  getTrainingDatasetSummary,
  type OcrBenchmarkDocumentSummary,
  type OcrBenchmarkSummaryResponse,
  type TrainingDatasetSummaryResponse,
} from '../services/api'

const benchmark =
  ref<OcrBenchmarkSummaryResponse | null>(null)
const training =
  ref<TrainingDatasetSummaryResponse | null>(null)
const loading = ref(true)
const exporting = ref(false)
const error = ref('')

const documentOrder = [
  'PASSPORT',
  'TAIWAN_COMPATRIOT_PERMIT',
  'TAIWAN_NATIONAL_ID',
]

const documentCards = computed(() =>
  documentOrder.map(type => ({
    type,
    benchmark:
      benchmark.value?.documents.find(
        item => item.documentType === type,
      ) ?? null,
    trainingCount:
      training.value?.documents.find(
        item => item.documentType === type,
      )?.sampleCount ?? 0,
  })),
)

function documentLabel(type: string) {
  if (type === 'PASSPORT') return '護照'
  if (type === 'TAIWAN_COMPATRIOT_PERMIT') {
    return '台胞證'
  }
  if (type === 'TAIWAN_NATIONAL_ID') {
    return '身分證'
  }
  return type
}

function fieldLabel(field: string) {
  const labels: Record<string, string> = {
    nameZh: '中文姓名',
    nameEn: '英文姓名',
    birthDate: '出生日期',
    gender: '性別',
    nationality: '國籍',
    nationalIdNumber: '身分證字號',
    documentNumber: '證件號碼',
    issuingCountry: '簽發國',
    expiryDate: '有效期限',
  }

  return labels[field] ?? field
}

function rate(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return '—'
  }

  return `${Math.round(value * 100)}%`
}

function seconds(
  value: number | null | undefined,
) {
  if (value === null || value === undefined) {
    return '—'
  }

  return `${(value / 1000).toFixed(1)} 秒`
}

function sampleStatus(
  item: OcrBenchmarkDocumentSummary | null,
) {
  const count = item?.scoredSampleCount ?? 0

  if (count >= 100) return '可做第一輪正式分析'
  if (count >= 50) return '可做中期分析'
  if (count >= 20) return '正在累積'
  return '樣本不足'
}

async function load() {
  loading.value = true
  error.value = ''

  try {
    const [benchmarkData, trainingData] =
      await Promise.all([
        getOcrBenchmarkSummary(),
        getTrainingDatasetSummary(),
      ])

    benchmark.value = benchmarkData
    training.value = trainingData
  } catch (err) {
    error.value =
      err instanceof Error
        ? err.message
        : 'OCR 品質資料載入失敗。'
  } finally {
    loading.value = false
  }
}

async function exportDataset() {
  if (
    exporting.value ||
    !training.value?.sampleCount
  ) {
    return
  }

  exporting.value = true
  error.value = ''

  try {
    await downloadTrainingDataset()
  } catch (err) {
    error.value =
      err instanceof Error
        ? err.message
        : '訓練資料匯出失敗。'
  } finally {
    exporting.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="page">
    <header class="page-header">
      <div>
        <p class="page-kicker">OCR QUALITY</p>
        <h1>OCR 品質</h1>
        <p>
          用人工審核結果當 ground truth，
          追蹤三種證件的準確率與辨識速度。
        </p>
      </div>

      <button
        type="button"
        class="secondary-action"
        :disabled="loading"
        @click="load"
      >
        重新整理
      </button>
    </header>

    <p
      v-if="error"
      class="error-message"
    >
      {{ error }}
    </p>

    <div
      v-if="loading"
      class="state-card"
    >
      正在統計 OCR 品質…
    </div>

    <template v-else>
      <section class="overview-grid">
        <div class="overview-card">
          <span>已審核樣本</span>
          <strong>
            {{ benchmark?.reviewedSampleCount ?? 0 }}
          </strong>
          <small>
            含舊資料；只有保存 originalFields
            的新資料可計算準確率。
          </small>
        </div>

        <div class="overview-card">
          <span>可評分樣本</span>
          <strong>
            {{ benchmark?.scoredSampleCount ?? 0 }}
          </strong>
          <small>
            這些樣本可比較 OCR 原始輸出與人工答案。
          </small>
        </div>

        <div class="overview-card training">
          <span>訓練資料集</span>
          <strong>
            {{ training?.sampleCount ?? 0 }}
          </strong>
          <small>
            只有人工明確勾選保留的證件照片。
          </small>
        </div>
      </section>

      <section class="document-grid">
        <article
          v-for="card in documentCards"
          :key="card.type"
          class="document-card"
        >
          <header>
            <div>
              <p>{{ documentLabel(card.type) }}</p>
              <strong>
                {{
                  card.benchmark?.scoredSampleCount ??
                  0
                }}
                張可評分
              </strong>
            </div>

            <span
              class="sample-state"
              :class="{
                ready:
                  (card.benchmark?.scoredSampleCount ??
                    0) >= 50,
              }"
            >
              {{
                sampleStatus(
                  card.benchmark,
                )
              }}
            </span>
          </header>

          <div class="metrics">
            <div>
              <span>整張完全正確</span>
              <strong>
                {{
                  rate(
                    card.benchmark
                      ?.fullDocumentExactRate,
                  )
                }}
              </strong>
            </div>
            <div>
              <span>人工修正率</span>
              <strong>
                {{
                  rate(
                    card.benchmark
                      ?.manualCorrectionRate,
                  )
                }}
              </strong>
            </div>
            <div>
              <span>Median</span>
              <strong>
                {{
                  seconds(
                    card.benchmark
                      ?.medianTotalMs,
                  )
                }}
              </strong>
            </div>
            <div>
              <span>P90</span>
              <strong>
                {{
                  seconds(
                    card.benchmark
                      ?.p90TotalMs,
                  )
                }}
              </strong>
            </div>
          </div>

          <div class="training-count">
            <span>已選訓練樣本</span>
            <strong>{{ card.trainingCount }}</strong>
          </div>

          <div
            v-if="card.benchmark?.fields.length"
            class="field-list"
          >
            <div
              v-for="field in card.benchmark.fields"
              :key="field.field"
            >
              <span>
                {{ fieldLabel(field.field) }}
              </span>
              <div class="field-progress">
                <span
                  :style="{
                    width:
                      `${Math.round(
                        field.exactMatchRate *
                          100,
                      )}%`,
                  }"
                ></span>
              </div>
              <strong>
                {{ rate(field.exactMatchRate) }}
              </strong>
            </div>
          </div>

          <div
            v-else
            class="field-empty"
          >
            完成人工審核後，這裡會開始顯示各欄位準確率。
          </div>
        </article>
      </section>

      <section class="dataset-card">
        <div class="dataset-copy">
          <p class="page-kicker">
            PRIVATE TRAINING DATASET
          </p>
          <h2>訓練資料集</h2>
          <p>
            只有審核時勾選「保留此樣本供 OCR 改善」
            的證件會被獨立複製到這裡。
            Production 照片原本的刪除期限不會改變。
          </p>

          <div class="privacy-note">
            <strong>這個 ZIP 含真實證件照片與人工標註。</strong>
            <span>
              只放受控本機／私人儲存空間，不可提交到 GitHub。
            </span>
          </div>
        </div>

        <div class="dataset-actions">
          <div>
            <span>目前可匯出</span>
            <strong>
              {{ training?.sampleCount ?? 0 }}
              張
            </strong>
          </div>

          <button
            type="button"
            class="primary-action"
            :disabled="
              exporting ||
              !training?.sampleCount
            "
            @click="exportDataset"
          >
            {{
              exporting
                ? '匯出中…'
                : '匯出 Dataset ZIP'
            }}
          </button>
        </div>
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
  margin: 3px 0 7px;
  color: #182236;
  font-size: 29px;
  letter-spacing: -.025em;
}

.page-header p:not(.page-kicker) {
  max-width: 720px;
  margin: 0;
  color: #6f7b8e;
  font-size: 13px;
  line-height: 1.6;
}

.page-kicker {
  margin: 0;
  color: #8792a3;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .14em;
}

.primary-action,
.secondary-action {
  min-height: 41px;
  padding: 0 14px;
  border-radius: 9px;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.primary-action {
  border: 1px solid #172033;
  background: #172033;
  color: #fff;
}

.secondary-action {
  border: 1px solid #d5dce7;
  background: #fff;
  color: #334158;
}

.overview-grid {
  display: grid;
  grid-template-columns:
    repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.overview-card {
  display: grid;
  gap: 5px;
  padding: 16px;
  border: 1px solid #dde4ed;
  border-radius: 13px;
  background: #fff;
}

.overview-card.training {
  border-color: #cfe2d6;
  background: #f7fbf8;
}

.overview-card > span {
  color: #778397;
  font-size: 10px;
}

.overview-card strong {
  color: #1c2940;
  font-size: 25px;
}

.overview-card small {
  color: #8994a4;
  font-size: 9px;
  line-height: 1.5;
}

.document-grid {
  display: grid;
  grid-template-columns:
    repeat(3, minmax(0, 1fr));
  gap: 13px;
  align-items: start;
}

.document-card {
  overflow: hidden;
  border: 1px solid #dde3ec;
  border-radius: 14px;
  background: #fff;
}

.document-card > header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid #edf1f5;
}

.document-card header p {
  margin: 0 0 4px;
  color: #768297;
  font-size: 10px;
}

.document-card header strong {
  color: #202d43;
  font-size: 15px;
}

.sample-state {
  padding: 4px 7px;
  border-radius: 999px;
  background: #f1f3f6;
  color: #7b8798;
  font-size: 9px;
  font-weight: 700;
  white-space: nowrap;
}

.sample-state.ready {
  background: #eaf7ef;
  color: #247247;
}

.metrics {
  display: grid;
  grid-template-columns:
    repeat(2, 1fr);
  gap: 1px;
  background: #edf1f5;
}

.metrics div {
  display: grid;
  gap: 3px;
  padding: 12px;
  background: #fafbfc;
}

.metrics span {
  color: #7b8799;
  font-size: 9px;
}

.metrics strong {
  color: #26354d;
  font-size: 16px;
}

.training-count {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid #edf1f5;
  color: #6f7b8e;
  font-size: 10px;
}

.training-count strong {
  color: #2b6848;
  font-size: 14px;
}

.field-list {
  display: grid;
  gap: 10px;
  padding: 14px;
}

.field-list > div {
  display: grid;
  grid-template-columns:
    70px minmax(0, 1fr) 38px;
  gap: 8px;
  align-items: center;
}

.field-list span,
.field-list strong {
  font-size: 9px;
}

.field-list > div > span {
  color: #647188;
}

.field-list > div > strong {
  color: #344158;
  text-align: right;
}

.field-progress {
  height: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: #edf1f5;
}

.field-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #5f718d;
}

.field-empty {
  min-height: 110px;
  display: grid;
  place-items: center;
  padding: 18px;
  color: #8792a2;
  font-size: 9px;
  line-height: 1.6;
  text-align: center;
}

.dataset-card {
  display: flex;
  gap: 24px;
  align-items: center;
  justify-content: space-between;
  padding: 18px;
  border: 1px solid #d7e5dc;
  border-radius: 14px;
  background: #f8fbf9;
}

.dataset-copy h2 {
  margin: 3px 0 6px;
  color: #1f2d42;
  font-size: 17px;
}

.dataset-copy > p:not(.page-kicker) {
  max-width: 720px;
  margin: 0;
  color: #6d7a8c;
  font-size: 10px;
  line-height: 1.6;
}

.privacy-note {
  display: grid;
  gap: 2px;
  margin-top: 12px;
  padding: 10px 11px;
  border: 1px solid #ead8b2;
  border-radius: 9px;
  background: #fff9ee;
}

.privacy-note strong {
  color: #805b1b;
  font-size: 10px;
}

.privacy-note span {
  color: #8c7449;
  font-size: 9px;
}

.dataset-actions {
  display: flex;
  gap: 14px;
  align-items: center;
  flex: 0 0 auto;
}

.dataset-actions > div {
  display: grid;
  gap: 2px;
  text-align: right;
}

.dataset-actions span {
  color: #788497;
  font-size: 9px;
}

.dataset-actions strong {
  color: #243249;
  font-size: 16px;
}

.state-card {
  display: grid;
  place-items: center;
  min-height: 220px;
  color: #788497;
  font-size: 11px;
}

.error-message {
  margin: 0;
  color: #bd3328;
  font-size: 10px;
}

button:disabled {
  cursor: not-allowed;
  opacity: .5;
}

@media (max-width: 1000px) {
  .document-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .page-header,
  .dataset-card,
  .dataset-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .overview-grid {
    grid-template-columns: 1fr;
  }

  .dataset-actions > div {
    text-align: left;
  }
}
</style>
