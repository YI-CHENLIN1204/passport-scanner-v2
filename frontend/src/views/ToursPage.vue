<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  createTour,
  listTours,
  type TourSummaryResponse,
} from '../services/api'

const emit = defineEmits<{
  navigate: [path: string]
}>()

const tours = ref<TourSummaryResponse[]>([])
const loading = ref(true)
const error = ref('')
const search = ref('')
const createOpen = ref(false)
const creating = ref(false)
const createError = ref('')

const form = ref({
  tourName: '',
  departureDate: '',
  returnDate: '',
  requiredDocumentTypes: ['PASSPORT'] as string[],
})

const documentOptions = [
  { value: 'PASSPORT', label: '護照' },
  { value: 'TAIWAN_COMPATRIOT_PERMIT', label: '台胞證' },
  { value: 'TAIWAN_NATIONAL_ID', label: '台灣身分證' },
]

const resultText = computed(() =>
  search.value.trim()
    ? `找到 ${tours.value.length} 個團別`
    : `共 ${tours.value.length} 個團別`,
)

function documentLabel(type: string) {
  if (type === 'PASSPORT') return '護照'
  if (type === 'TAIWAN_COMPATRIOT_PERMIT') return '台胞證'
  if (type === 'TAIWAN_NATIONAL_ID') return '身分證'
  return type
}

function formatDate(value: string) {
  return value.replaceAll('-', '/')
}

async function loadTours() {
  loading.value = true
  error.value = ''

  try {
    tours.value = await listTours(search.value)
  } catch (err) {
    error.value =
      err instanceof Error
        ? err.message
        : '團別載入失敗。'
  } finally {
    loading.value = false
  }
}

function openCreate() {
  createError.value = ''
  createOpen.value = true
}

function closeCreate() {
  if (creating.value) return
  createOpen.value = false
}

async function submitCreate() {
  createError.value = ''

  if (!form.value.tourName.trim()) {
    createError.value = '請輸入團別名稱。'
    return
  }

  if (!form.value.departureDate || !form.value.returnDate) {
    createError.value = '請填寫出發日與回國日。'
    return
  }

  if (!form.value.requiredDocumentTypes.length) {
    createError.value = '請至少選擇一種需要收集的證件。'
    return
  }

  creating.value = true

  try {
    const tour = await createTour({
      tourName: form.value.tourName.trim(),
      departureDate: form.value.departureDate,
      returnDate: form.value.returnDate,
      requiredDocumentTypes: form.value.requiredDocumentTypes,
    })

    form.value = {
      tourName: '',
      departureDate: '',
      returnDate: '',
      requiredDocumentTypes: ['PASSPORT'],
    }

    createOpen.value = false
    emit('navigate', `/tours/${tour.tourId}`)
  } catch (err) {
    createError.value =
      err instanceof Error
        ? err.message
        : '建立團別失敗。'
  } finally {
    creating.value = false
  }
}

onMounted(loadTours)
</script>

<template>
  <section class="page">
    <header class="page-header">
      <div>
        <p class="page-kicker">TOURS</p>
        <h1>團別管理</h1>
        <p>查看目前收件進度，進入團別後處理旅客證件與人工審核。</p>
      </div>

      <button
        type="button"
        class="primary-action"
        @click="openCreate"
      >
        ＋ 建立團別
      </button>
    </header>

    <div class="toolbar">
      <div class="search-box">
        <span>⌕</span>
        <input
          v-model="search"
          type="search"
          placeholder="搜尋團別名稱"
          @keyup.enter="loadTours"
        />
      </div>

      <button
        type="button"
        class="secondary-action"
        :disabled="loading"
        @click="loadTours"
      >
        搜尋
      </button>

      <span class="result-count">{{ resultText }}</span>
    </div>

    <p v-if="error" class="error-message">{{ error }}</p>

    <div v-if="loading" class="state-card">
      正在載入團別…
    </div>

    <div v-else-if="!tours.length" class="state-card">
      <strong>目前沒有符合條件的團別</strong>
      <span>建立第一個團別後，就可以開始批次收取證件。</span>
    </div>

    <div v-else class="tour-grid">
      <button
        v-for="tour in tours"
        :key="tour.tourId"
        type="button"
        class="tour-card"
        @click="emit('navigate', `/tours/${tour.tourId}`)"
      >
        <div class="tour-card-head">
          <div>
            <strong>{{ tour.tourName }}</strong>
            <span>
              {{ formatDate(tour.departureDate) }}
              →
              {{ formatDate(tour.returnDate) }}
            </span>
          </div>
          <span class="enter-arrow">→</span>
        </div>

        <div class="tour-metrics">
          <div>
            <strong>{{ tour.memberCount }}</strong>
            <span>目前人數</span>
          </div>
          <div>
            <strong>{{ tour.receivedDocumentCount }}</strong>
            <span>已收證件</span>
          </div>
          <div>
            <strong>{{ tour.pendingReviewCount }}</strong>
            <span>待審核</span>
          </div>
        </div>

        <div class="required-documents">
          <span
            v-for="type in tour.requiredDocumentTypes"
            :key="type"
          >
            {{ documentLabel(type) }}
          </span>
        </div>
      </button>
    </div>

    <div
      v-if="createOpen"
      class="modal-backdrop"
      @click.self="closeCreate"
    >
      <section class="create-modal" role="dialog" aria-modal="true">
        <header>
          <div>
            <p class="page-kicker">NEW TOUR</p>
            <h2>建立團別</h2>
          </div>
          <button
            type="button"
            class="icon-button"
            :disabled="creating"
            @click="closeCreate"
          >
            ×
          </button>
        </header>

        <div class="form-stack">
          <label>
            <span>團別名稱</span>
            <input
              v-model="form.tourName"
              type="text"
              placeholder="例如：東京賞楓五日"
            />
          </label>

          <div class="date-grid">
            <label>
              <span>出發日</span>
              <input
                v-model="form.departureDate"
                type="date"
              />
            </label>

            <label>
              <span>回國日</span>
              <input
                v-model="form.returnDate"
                type="date"
              />
            </label>
          </div>

          <fieldset>
            <legend>此團需要收集的證件</legend>
            <label
              v-for="option in documentOptions"
              :key="option.value"
              class="check-option"
            >
              <input
                v-model="form.requiredDocumentTypes"
                type="checkbox"
                :value="option.value"
              />
              <span>{{ option.label }}</span>
            </label>
          </fieldset>
        </div>

        <p v-if="createError" class="error-message">
          {{ createError }}
        </p>

        <footer>
          <button
            type="button"
            class="secondary-action"
            :disabled="creating"
            @click="closeCreate"
          >
            取消
          </button>
          <button
            type="button"
            class="primary-action"
            :disabled="creating"
            @click="submitCreate"
          >
            {{ creating ? '建立中…' : '建立團別' }}
          </button>
        </footer>
      </section>
    </div>
  </section>
</template>

<style scoped>
.page {
  display: grid;
  gap: 24px;
}

.page-header {
  display: flex;
  gap: 24px;
  align-items: flex-start;
  justify-content: space-between;
}

.page-header h1,
.create-modal h2 {
  margin: 2px 0 6px;
  color: #172033;
}

.page-header h1 {
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

.primary-action,
.secondary-action,
.icon-button {
  border: 0;
  border-radius: 10px;
  font: inherit;
  cursor: pointer;
}

.primary-action {
  min-height: 42px;
  padding: 0 16px;
  background: #172033;
  color: #fff;
  font-weight: 700;
}

.secondary-action {
  min-height: 42px;
  padding: 0 15px;
  border: 1px solid #d4dce7;
  background: #fff;
  color: #26334a;
  font-weight: 650;
}

.toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
}

.search-box {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 13px;
  border: 1px solid #d7dfeb;
  border-radius: 11px;
  background: #fff;
}

.search-box input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
}

.result-count {
  color: #7a8799;
  font-size: 13px;
}

.tour-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.tour-card {
  display: grid;
  gap: 20px;
  padding: 20px;
  border: 1px solid #dce3ed;
  border-radius: 16px;
  background: #fff;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color .15s ease, transform .15s ease;
}

.tour-card:hover {
  transform: translateY(-2px);
  border-color: #aebbd0;
}

.tour-card-head {
  display: flex;
  gap: 12px;
  justify-content: space-between;
}

.tour-card-head > div {
  display: grid;
  gap: 5px;
}

.tour-card-head strong {
  color: #172033;
  font-size: 17px;
}

.tour-card-head span {
  color: #718096;
  font-size: 13px;
}

.enter-arrow {
  font-size: 20px !important;
  color: #33435d !important;
}

.tour-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.tour-metrics div {
  display: grid;
  gap: 2px;
  padding: 10px;
  border-radius: 10px;
  background: #f6f8fb;
}

.tour-metrics strong {
  color: #1b2940;
  font-size: 20px;
}

.tour-metrics span {
  color: #7b879a;
  font-size: 11px;
}

.required-documents {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.required-documents span {
  padding: 5px 9px;
  border-radius: 999px;
  background: #eef2f8;
  color: #40516d;
  font-size: 12px;
  font-weight: 650;
}

.state-card {
  min-height: 220px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 6px;
  border: 1px dashed #d5deea;
  border-radius: 16px;
  background: #fff;
  color: #7c8799;
  text-align: center;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(15 23 42 / 48%);
  z-index: 100;
}

.create-modal {
  width: min(560px, 100%);
  padding: 22px;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 24px 70px rgb(15 23 42 / 22%);
}

.create-modal > header,
.create-modal > footer {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.create-modal > footer {
  justify-content: flex-end;
  margin-top: 22px;
}

.icon-button {
  width: 38px;
  height: 38px;
  background: #f1f4f8;
  color: #344158;
  font-size: 22px;
}

.form-stack {
  display: grid;
  gap: 16px;
  margin-top: 20px;
}

.form-stack > label,
.date-grid label {
  display: grid;
  gap: 6px;
  color: #334158;
  font-size: 13px;
  font-weight: 700;
}

.form-stack input[type='text'],
.form-stack input[type='date'] {
  min-height: 43px;
  padding: 0 12px;
  border: 1px solid #cfd8e5;
  border-radius: 10px;
  font: inherit;
}

.date-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

fieldset {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 0;
  padding: 12px;
  border: 1px solid #d5deea;
  border-radius: 11px;
}

legend {
  padding: 0 5px;
  color: #5e6c82;
  font-size: 12px;
  font-weight: 700;
}

.check-option {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 8px 10px;
  border-radius: 9px;
  background: #f5f7fa;
  color: #344158;
  font-size: 13px;
}

.error-message {
  color: #bd3328;
}

@media (max-width: 720px) {
  .page-header,
  .toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .date-grid {
    grid-template-columns: 1fr;
  }

  .result-count {
    order: -1;
  }
}
</style>
