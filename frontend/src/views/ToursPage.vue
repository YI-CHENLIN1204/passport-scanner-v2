<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
} from 'vue'
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

function expectedDocumentCount(tour: TourSummaryResponse) {
  return (
    tour.memberCount *
    tour.requiredDocumentTypes.length
  )
}

function collectionPercent(tour: TourSummaryResponse) {
  const expected = expectedDocumentCount(tour)

  if (!expected) return 0

  return Math.min(
    100,
    Math.round(
      (tour.receivedDocumentCount / expected) * 100,
    ),
  )
}

function statusLabel(tour: TourSummaryResponse) {
  const expected = expectedDocumentCount(tour)

  if (!tour.memberCount) return '尚未收件'
  if (tour.pendingReviewCount > 0) return '待審核'
  if (
    expected > 0 &&
    tour.receivedDocumentCount >= expected
  ) {
    return '收件完成'
  }

  return '收件中'
}

function statusClass(tour: TourSummaryResponse) {
  const label = statusLabel(tour)

  if (label === '收件完成') return 'complete'
  if (label === '待審核') return 'pending'
  if (label === '收件中') return 'progress'
  return 'empty'
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

function handleEscape(event: KeyboardEvent) {
  if (event.key === 'Escape' && createOpen.value) {
    closeCreate()
  }
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

  if (form.value.returnDate < form.value.departureDate) {
    createError.value = '回國日不可早於出發日。'
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
      requiredDocumentTypes:
        form.value.requiredDocumentTypes,
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

onMounted(() => {
  void loadTours()
  window.addEventListener('keydown', handleEscape)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleEscape)
})
</script>

<template>
  <section class="page">
    <header class="page-header">
      <div>
        <p class="page-kicker">TOURS</p>
        <h1>團別管理</h1>
        <p>查看收件與審核進度，點進團別後處理旅客證件。</p>
      </div>

      <button
        type="button"
        class="primary-action"
        @click="openCreate"
      >
        <span class="button-plus">＋</span>
        建立團別
      </button>
    </header>

    <div class="toolbar">
      <div class="search-box">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
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
      <span class="loading-dot"></span>
      正在載入團別…
    </div>

    <div v-else-if="!tours.length" class="state-card">
      <strong>目前沒有符合條件的團別</strong>
      <span>建立第一個團別後，就可以開始批次收取證件。</span>
      <button
        v-if="!search.trim()"
        type="button"
        class="empty-create"
        @click="openCreate"
      >
        建立第一個團別
      </button>
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
          <div class="tour-title">
            <div class="tour-title-line">
              <strong>{{ tour.tourName }}</strong>
              <span
                class="tour-state"
                :class="statusClass(tour)"
              >
                {{ statusLabel(tour) }}
              </span>
            </div>
            <span class="tour-date">
              {{ formatDate(tour.departureDate) }}
              <span aria-hidden="true">→</span>
              {{ formatDate(tour.returnDate) }}
            </span>
          </div>

          <span class="enter-arrow" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M5 12h14M14 7l5 5-5 5" />
            </svg>
          </span>
        </div>

        <div class="tour-progress">
          <div class="progress-meta">
            <span>證件收集進度</span>
            <strong>
              {{ tour.receivedDocumentCount }}
              /
              {{ expectedDocumentCount(tour) }}
            </strong>
          </div>
          <div class="progress-track">
            <span
              :style="{
                width: `${collectionPercent(tour)}%`,
              }"
            ></span>
          </div>
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
          <div
            :class="{
              attention: tour.pendingReviewCount > 0,
            }"
          >
            <strong>{{ tour.pendingReviewCount }}</strong>
            <span>待審核</span>
          </div>
        </div>

        <div class="card-footer">
          <div class="required-documents">
            <span
              v-for="type in tour.requiredDocumentTypes"
              :key="type"
            >
              {{ documentLabel(type) }}
            </span>
          </div>

          <span class="open-label">進入團別</span>
        </div>
      </button>
    </div>

    <div
      v-if="createOpen"
      class="modal-backdrop"
      @click.self="closeCreate"
    >
      <section
        class="create-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-tour-title"
      >
        <header>
          <div>
            <p class="page-kicker">NEW TOUR</p>
            <h2 id="create-tour-title">建立團別</h2>
            <p>只建立收件工作區，不設定預計人數。</p>
          </div>
          <button
            type="button"
            class="icon-button"
            :disabled="creating"
            aria-label="關閉"
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
              maxlength="160"
              placeholder="例如：東京賞楓五日"
              autofocus
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
                :min="form.departureDate || undefined"
              />
            </label>
          </div>

          <fieldset>
            <legend>此團需要收集的證件</legend>
            <label
              v-for="option in documentOptions"
              :key="option.value"
              class="check-option"
              :class="{
                selected:
                  form.requiredDocumentTypes.includes(
                    option.value,
                  ),
              }"
            >
              <input
                v-model="form.requiredDocumentTypes"
                type="checkbox"
                :value="option.value"
              />
              <span class="check-box" aria-hidden="true">✓</span>
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
  margin: 3px 0 7px;
  color: #182236;
}

.page-header h1 {
  font-size: 29px;
  letter-spacing: -.025em;
}

.page-header p:not(.page-kicker),
.create-modal header p:not(.page-kicker) {
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
.secondary-action,
.icon-button,
.empty-create {
  border-radius: 10px;
  font: inherit;
  cursor: pointer;
}

.primary-action {
  min-height: 42px;
  display: inline-flex;
  gap: 5px;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
  border: 1px solid #172033;
  background: #172033;
  color: #fff;
  font-weight: 700;
  box-shadow: 0 1px 1px rgb(15 23 42 / 8%);
}

.primary-action:hover {
  background: #202d43;
}

.button-plus {
  font-size: 18px;
  line-height: 1;
}

.secondary-action {
  min-height: 42px;
  padding: 0 15px;
  border: 1px solid #d5dce7;
  background: #fff;
  color: #334158;
  font-weight: 650;
}

.secondary-action:hover {
  border-color: #bfc9d7;
  background: #fafbfc;
}

.toolbar {
  display: flex;
  gap: 9px;
  align-items: center;
  padding: 11px;
  border: 1px solid #e0e5ed;
  border-radius: 14px;
  background: #fff;
}

.search-box {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 40px;
  padding: 0 11px;
  border: 1px solid #d8e0ea;
  border-radius: 9px;
  background: #f9fafc;
}

.search-box:focus-within {
  border-color: #9aa8bb;
  background: #fff;
  box-shadow: 0 0 0 3px rgb(40 54 75 / 6%);
}

.search-box svg {
  width: 17px;
  height: 17px;
  flex: 0 0 auto;
  fill: none;
  stroke: #8290a5;
  stroke-linecap: round;
  stroke-width: 1.8;
}

.search-box input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: #263249;
}

.result-count {
  min-width: 92px;
  color: #7c8799;
  font-size: 12px;
  text-align: right;
}

.tour-grid {
  display: grid;
  grid-template-columns:
    repeat(auto-fill, minmax(320px, 1fr));
  gap: 15px;
}

.tour-card {
  display: grid;
  gap: 18px;
  padding: 19px;
  border: 1px solid #dde3ec;
  border-radius: 15px;
  background: #fff;
  color: inherit;
  text-align: left;
  cursor: pointer;
  box-shadow: 0 1px 2px rgb(15 23 42 / 2%);
  transition:
    border-color .15s ease,
    box-shadow .15s ease,
    transform .15s ease;
}

.tour-card:hover {
  transform: translateY(-2px);
  border-color: #b8c3d2;
  box-shadow: 0 8px 22px rgb(15 23 42 / 6%);
}

.tour-card-head {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  justify-content: space-between;
}

.tour-title {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.tour-title-line {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.tour-title-line > strong {
  overflow: hidden;
  color: #182236;
  font-size: 16px;
  font-weight: 760;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tour-date {
  display: flex;
  gap: 7px;
  align-items: center;
  color: #778397;
  font-size: 12px;
}

.tour-state {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 750;
}

.tour-state.complete {
  background: #eaf7ef;
  color: #247247;
}

.tour-state.pending {
  background: #fff3db;
  color: #936414;
}

.tour-state.progress {
  background: #edf2f8;
  color: #50627d;
}

.tour-state.empty {
  background: #f1f3f6;
  color: #7a8596;
}

.enter-arrow {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 9px;
  background: #f4f6f9;
  color: #53617a;
}

.enter-arrow svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.tour-progress {
  display: grid;
  gap: 7px;
}

.progress-meta {
  display: flex;
  justify-content: space-between;
  color: #7b8798;
  font-size: 11px;
}

.progress-meta strong {
  color: #516078;
  font-weight: 750;
}

.progress-track {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: #edf1f5;
}

.progress-track span {
  display: block;
  height: 100%;
  min-width: 0;
  border-radius: inherit;
  background: #586a84;
  transition: width .2s ease;
}

.tour-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 7px;
}

.tour-metrics div {
  display: grid;
  gap: 3px;
  padding: 10px 11px;
  border: 1px solid #edf0f4;
  border-radius: 10px;
  background: #f8f9fb;
}

.tour-metrics div.attention {
  border-color: #f2dfb8;
  background: #fffaf0;
}

.tour-metrics strong {
  color: #1d2a40;
  font-size: 19px;
  line-height: 1.1;
}

.tour-metrics div.attention strong {
  color: #976719;
}

.tour-metrics span {
  color: #7b8799;
  font-size: 10px;
}

.card-footer {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  min-height: 27px;
}

.required-documents {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.required-documents span {
  padding: 4px 8px;
  border-radius: 999px;
  background: #eef2f7;
  color: #4b5c77;
  font-size: 10px;
  font-weight: 700;
}

.open-label {
  color: #68768b;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}

.state-card {
  min-height: 240px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 7px;
  border: 1px dashed #d5dde8;
  border-radius: 15px;
  background: #fff;
  color: #7b8798;
  text-align: center;
}

.state-card strong {
  color: #455269;
}

.state-card > span:not(.loading-dot) {
  font-size: 12px;
}

.loading-dot {
  width: 9px;
  height: 9px;
  margin-bottom: 3px;
  border-radius: 50%;
  background: #65758c;
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  50% {
    opacity: .35;
    transform: scale(.8);
  }
}

.empty-create {
  min-height: 36px;
  margin-top: 7px;
  padding: 0 12px;
  border: 1px solid #d5dde8;
  background: #f8f9fb;
  color: #40506a;
  font-size: 12px;
  font-weight: 700;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(15 23 42 / 48%);
  backdrop-filter: blur(2px);
  z-index: 100;
}

.create-modal {
  width: min(560px, 100%);
  padding: 22px;
  border: 1px solid #e1e6ed;
  border-radius: 17px;
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

.create-modal > header {
  align-items: flex-start;
}

.create-modal > footer {
  justify-content: flex-end;
  margin-top: 22px;
}

.icon-button {
  width: 37px;
  height: 37px;
  border: 0;
  background: #f1f4f8;
  color: #435069;
  font-size: 21px;
}

.form-stack {
  display: grid;
  gap: 16px;
  margin-top: 21px;
}

.form-stack > label,
.date-grid label {
  display: grid;
  gap: 6px;
  color: #425067;
  font-size: 12px;
  font-weight: 700;
}

.form-stack input[type='text'],
.form-stack input[type='date'] {
  min-height: 43px;
  padding: 0 11px;
  border: 1px solid #d1d9e5;
  border-radius: 9px;
  outline: 0;
  color: #28354a;
  font: inherit;
}

.form-stack input:focus {
  border-color: #98a6b9;
  box-shadow: 0 0 0 3px rgb(40 54 75 / 6%);
}

.date-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 11px;
}

fieldset {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 0;
  padding: 13px;
  border: 1px solid #d9e0e9;
  border-radius: 10px;
}

legend {
  padding: 0 5px;
  color: #66748a;
  font-size: 11px;
  font-weight: 700;
}

.check-option {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  min-height: 36px;
  padding: 0 10px;
  border: 1px solid #e1e6ed;
  border-radius: 9px;
  background: #f8f9fb;
  color: #4a586f;
  font-size: 12px;
  cursor: pointer;
}

.check-option.selected {
  border-color: #c4cfdd;
  background: #eef2f7;
  color: #2f3e55;
}

.check-option input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.check-box {
  width: 17px;
  height: 17px;
  display: grid;
  place-items: center;
  border: 1px solid #c9d2df;
  border-radius: 5px;
  background: #fff;
  color: transparent;
  font-size: 11px;
}

.check-option.selected .check-box {
  border-color: #34435b;
  background: #34435b;
  color: #fff;
}

.error-message {
  margin: 12px 0 0;
  color: #b63c32;
  font-size: 12px;
}

button:disabled {
  cursor: not-allowed;
  opacity: .55;
}

@media (max-width: 720px) {
  .page-header,
  .toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .toolbar {
    padding: 10px;
  }

  .result-count {
    min-width: 0;
    text-align: left;
    order: -1;
  }

  .date-grid {
    grid-template-columns: 1fr;
  }
}
</style>
