<script setup lang="ts">
import {
  computed,
  onMounted,
  ref,
  watch,
} from 'vue'
import {
  createTour,
  downloadTourCsv,
  getTourDetail,
  listTours,
  type TourDetailResponse,
  type TourMemberResponse,
  type TourSummaryResponse,
} from '../services/api'

const props = defineProps<{
  selectedTourId?: string | null
}>()

const emit = defineEmits<{
  selectTour: [tour: TourSummaryResponse]
  scanTour: [tour: TourSummaryResponse]
}>()

const tours = ref<TourSummaryResponse[]>([])
const detail = ref<TourDetailResponse | null>(null)
const loading = ref(false)
const detailLoading = ref(false)
const error = ref('')
const search = ref('')
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

const activeTourId = computed(
  () =>
    detail.value?.tour.tourId ??
    props.selectedTourId ??
    null,
)

function documentLabel(type: string) {
  if (type === 'PASSPORT') return '護照'
  if (type === 'TAIWAN_COMPATRIOT_PERMIT') return '台胞證'
  if (type === 'TAIWAN_NATIONAL_ID') return '身分證'
  return type
}

function safeFilename(name: string) {
  const normalized = name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')

  return `${normalized || 'tour'}-證件資料.csv`
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
        : '團別清單載入失敗。'
  } finally {
    loading.value = false
  }
}

async function openTour(tour: TourSummaryResponse) {
  detailLoading.value = true
  error.value = ''

  try {
    detail.value = await getTourDetail(tour.tourId)
    emit('selectTour', tour)
  } catch (err) {
    error.value =
      err instanceof Error
        ? err.message
        : '團別資料載入失敗。'
  } finally {
    detailLoading.value = false
  }
}

async function createNewTour() {
  createError.value = ''

  if (!form.value.tourName.trim()) {
    createError.value = '請輸入團別名稱。'
    return
  }

  if (
    !form.value.departureDate ||
    !form.value.returnDate
  ) {
    createError.value = '請填寫出發日與回國日。'
    return
  }

  if (!form.value.requiredDocumentTypes.length) {
    createError.value = '請至少選擇一種此團需要的證件。'
    return
  }

  creating.value = true

  try {
    const created = await createTour({
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

    await loadTours()
    await openTour(created)
  } catch (err) {
    createError.value =
      err instanceof Error
        ? err.message
        : '建立團別失敗。'
  } finally {
    creating.value = false
  }
}

async function exportCurrentTour() {
  if (!detail.value) return

  try {
    await downloadTourCsv(
      detail.value.tour.tourId,
      safeFilename(detail.value.tour.tourName),
    )
  } catch (err) {
    error.value =
      err instanceof Error
        ? err.message
        : '匯出失敗。'
  }
}

function scanCurrentTour() {
  if (!detail.value) return
  emit('scanTour', detail.value.tour)
}

function hasDocument(
  member: TourMemberResponse,
  type: string,
) {
  return member.documents.some(
    document =>
      document.documentType === type &&
      document.isCurrent,
  )
}

function memberStatus(
  member: TourMemberResponse,
  requiredDocumentTypes: string[],
) {
  return requiredDocumentTypes.every(
    type => hasDocument(member, type),
  )
    ? '完成'
    : '缺證件'
}

watch(
  () => props.selectedTourId,
  async (tourId) => {
    if (!tourId || detail.value?.tour.tourId === tourId) {
      return
    }

    const tour = tours.value.find(
      item => item.tourId === tourId,
    )

    if (tour) {
      await openTour(tour)
    }
  },
)

onMounted(async () => {
  await loadTours()

  if (props.selectedTourId) {
    const tour = tours.value.find(
      item => item.tourId === props.selectedTourId,
    )

    if (tour) {
      await openTour(tour)
    }
  }
})
</script>

<template>
  <section class="tour-workspace">
    <div class="tour-toolbar">
      <div>
        <p class="tour-eyebrow">GROUP DOCUMENT WORKSPACE</p>
        <h2>團別管理</h2>
        <p>
          先建立或選擇一個團，再進入該團掃描旅客證件；完成後可整團匯出。
        </p>
      </div>
    </div>

    <section class="create-tour-card">
      <div class="create-tour-heading">
        <div>
          <strong>建立新團別</strong>
          <span>設定團名、日期與這一團實際需要收的證件。</span>
        </div>
      </div>

      <div class="create-tour-grid">
        <label>
          <span>團別名稱</span>
          <input
            v-model="form.tourName"
            type="text"
            placeholder="例如：東京五日團"
          />
        </label>

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

        <fieldset class="document-requirements">
          <legend>此團需要的證件</legend>
          <label
            v-for="option in documentOptions"
            :key="option.value"
            class="document-requirement-option"
          >
            <input
              v-model="form.requiredDocumentTypes"
              type="checkbox"
              :value="option.value"
            />
            <span>{{ option.label }}</span>
          </label>
        </fieldset>

        <button
          type="button"
          :disabled="creating"
          @click="createNewTour"
        >
          {{ creating ? '建立中…' : '建立團別' }}
        </button>
      </div>

      <p
        v-if="createError"
        class="tour-error"
      >
        {{ createError }}
      </p>
    </section>

    <div class="tour-search-row">
      <input
        v-model="search"
        type="search"
        placeholder="搜尋團別名稱"
        @keyup.enter="loadTours"
      />
      <button
        type="button"
        class="secondary"
        :disabled="loading"
        @click="loadTours"
      >
        搜尋
      </button>
    </div>

    <p
      v-if="error"
      class="tour-error"
    >
      {{ error }}
    </p>

    <div class="tour-layout">
      <section class="tour-list-card">
        <header>
          <strong>團別</strong>
          <span>{{ tours.length }} 團</span>
        </header>

        <div
          v-if="loading"
          class="tour-empty"
        >
          載入中…
        </div>

        <div
          v-else-if="!tours.length"
          class="tour-empty"
        >
          尚未建立團別。
        </div>

        <button
          v-for="tour in tours"
          :key="tour.tourId"
          type="button"
          class="tour-list-item"
          :class="{
            active: activeTourId === tour.tourId,
          }"
          @click="openTour(tour)"
        >
          <span class="tour-list-heading">
            <span class="tour-list-title">
              {{ tour.tourName }}
            </span>
            <span class="tour-enter-hint">
              進入團別
            </span>
          </span>

          <span class="tour-list-date">
            {{ tour.departureDate }} → {{ tour.returnDate }}
          </span>

          <span class="tour-list-metrics">
            <span>
              <strong>{{ tour.reviewedMemberCount }}</strong>
              人
            </span>
            <span>
              <strong>{{ tour.documentCount }}</strong>
              份證件
            </span>
          </span>

          <span class="tour-required-documents">
            <span
              v-for="type in tour.requiredDocumentTypes"
              :key="type"
            >
              {{ documentLabel(type) }}
            </span>
          </span>
        </button>
      </section>

      <section class="tour-detail-card">
        <div
          v-if="detailLoading"
          class="tour-empty"
        >
          載入團別資料中…
        </div>

        <div
          v-else-if="!detail"
          class="tour-empty tour-detail-empty"
        >
          從左側選擇一個團別，即可查看團員證件與開始掃描。
        </div>

        <template v-else>
          <header class="tour-detail-header">
            <div>
              <p class="tour-eyebrow">CURRENT TOUR</p>
              <h3>{{ detail.tour.tourName }}</h3>
              <p>
                {{ detail.tour.departureDate }}
                →
                {{ detail.tour.returnDate }}
              </p>
              <div class="tour-required-documents detail-required-documents">
                <span
                  v-for="type in detail.tour.requiredDocumentTypes"
                  :key="type"
                >
                  {{ documentLabel(type) }}
                </span>
              </div>
            </div>

            <div class="tour-detail-actions">
              <button
                type="button"
                class="secondary"
                @click="exportCurrentTour"
              >
                匯出 CSV
              </button>
              <button
                type="button"
                @click="scanCurrentTour"
              >
                新增／掃描證件
              </button>
            </div>
          </header>

          <div class="tour-stats">
            <div>
              <span>目前團員</span>
              <strong>
                {{ detail.tour.reviewedMemberCount }}
              </strong>
            </div>
            <div>
              <span>目前證件</span>
              <strong>{{ detail.tour.documentCount }}</strong>
            </div>
          </div>

          <div
            v-if="!detail.members.length"
            class="tour-empty tour-members-empty"
          >
            這個團目前還沒有已覆核的證件。按「進入證件掃描」開始第一位旅客。
          </div>

          <div
            v-else
            class="tour-members-table-wrap"
          >
            <table class="tour-members-table">
              <thead>
                <tr>
                  <th>姓名</th>
                  <th
                    v-for="type in detail.tour.requiredDocumentTypes"
                    :key="type"
                  >
                    {{ documentLabel(type) }}
                  </th>
                  <th>狀態</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="member in detail.members"
                  :key="member.tourMemberId"
                >
                  <td>
                    <div class="member-name">
                      <strong>
                        {{ member.nameZh || member.nameEn || '未命名旅客' }}
                      </strong>
                      <span
                        v-if="
                          member.nameEn &&
                          member.nameEn !== member.nameZh
                        "
                      >
                        {{ member.nameEn }}
                      </span>
                    </div>
                  </td>
                  <td
                    v-for="type in detail.tour.requiredDocumentTypes"
                    :key="type"
                    class="document-status-cell"
                  >
                    <span
                      :class="{
                        complete: hasDocument(member, type),
                      }"
                    >
                      {{ hasDocument(member, type) ? '✓' : '—' }}
                    </span>
                  </td>
                  <td>
                    <span class="member-status">
                      {{
                        memberStatus(
                          member,
                          detail.tour.requiredDocumentTypes,
                        )
                      }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </section>
    </div>
  </section>
</template>

<style scoped>
.tour-workspace {
  display: grid;
  gap: 18px;
}

.tour-toolbar,
.create-tour-card,
.tour-list-card,
.tour-detail-card {
  border: 1px solid #d9e1ec;
  border-radius: 18px;
  background: #fff;
}

.tour-toolbar {
  padding: 22px 24px;
}

.tour-toolbar h2,
.tour-detail-header h3 {
  margin: 4px 0 6px;
  color: #111c33;
}

.tour-toolbar p,
.tour-detail-header p {
  margin: 0;
  color: #65728b;
}

.tour-eyebrow {
  margin: 0;
  color: #5d6f8f;
  font-size: 12px;
  letter-spacing: .08em;
}

.create-tour-card {
  padding: 20px;
}

.create-tour-heading {
  margin-bottom: 14px;
}

.create-tour-heading div {
  display: flex;
  gap: 10px;
  align-items: baseline;
  flex-wrap: wrap;
}

.create-tour-heading span {
  color: #7a879f;
  font-size: 13px;
}

.create-tour-grid {
  display: grid;
  grid-template-columns:
    minmax(220px, 1.4fr)
    minmax(150px, .75fr)
    minmax(150px, .75fr)
    minmax(250px, 1.1fr)
    auto;
  gap: 12px;
  align-items: end;
}

.create-tour-grid label {
  display: grid;
  gap: 6px;
  color: #2f3c54;
  font-size: 13px;
  font-weight: 600;
}

.document-requirements {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  min-height: 44px;
  margin: 0;
  padding: 7px 10px;
  border: 1px solid #ccd6e5;
  border-radius: 10px;
}

.document-requirements legend {
  padding: 0 4px;
  color: #2f3c54;
  font-size: 12px;
  font-weight: 700;
}

.document-requirement-option {
  display: inline-flex !important;
  grid-template-columns: none !important;
  gap: 5px !important;
  align-items: center;
  font-weight: 500 !important;
}

.document-requirement-option input {
  min-height: auto;
}

.create-tour-grid input,
.tour-search-row input {
  min-height: 44px;
  border: 1px solid #ccd6e5;
  border-radius: 10px;
  padding: 0 12px;
  background: #fff;
  color: #111c33;
  font: inherit;
}

.create-tour-grid button,
.tour-search-row button,
.tour-detail-actions button {
  min-height: 44px;
  border: 0;
  border-radius: 10px;
  padding: 0 16px;
  background: #111c33;
  color: #fff;
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}

button.secondary {
  border: 1px solid #ccd6e5;
  background: #fff;
  color: #111c33;
}

.tour-search-row {
  display: flex;
  gap: 10px;
}

.tour-search-row input {
  flex: 1;
}

.tour-layout {
  display: grid;
  grid-template-columns: minmax(280px, .82fr) minmax(0, 1.55fr);
  gap: 16px;
  min-height: 470px;
}

.tour-list-card,
.tour-detail-card {
  overflow: hidden;
}

.tour-list-card > header {
  display: flex;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid #e5eaf2;
}

.tour-list-card > header span {
  color: #7a879f;
  font-size: 13px;
}

.tour-list-item {
  width: 100%;
  display: grid;
  gap: 5px;
  padding: 16px 18px;
  border: 0;
  border-bottom: 1px solid #edf1f6;
  background: #fff;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.tour-list-item:hover,
.tour-list-item.active {
  background: #f5f8fd;
}

.tour-list-item.active {
  box-shadow: inset 3px 0 #111c33;
}

.tour-list-heading {
  display: flex;
  gap: 12px;
  justify-content: space-between;
  align-items: center;
}

.tour-list-title {
  font-weight: 700;
  color: #111c33;
}

.tour-enter-hint {
  flex: 0 0 auto;
  color: #52647f;
  font-size: 12px;
  font-weight: 650;
}

.tour-list-date {
  color: #66738a;
  font-size: 13px;
}

.tour-list-metrics {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 3px;
}

.tour-list-metrics > span {
  padding: 4px 8px;
  border-radius: 999px;
  background: #f1f4f9;
  color: #66738a;
  font-size: 12px;
}

.tour-list-metrics strong {
  color: #273753;
  font-size: 13px;
}

.tour-required-documents {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.tour-required-documents > span {
  padding: 4px 8px;
  border-radius: 999px;
  background: #eef3ff;
  color: #27406c;
  font-size: 11px;
  font-weight: 650;
}

.detail-required-documents {
  margin-top: 10px;
}

.tour-detail-card {
  padding: 20px;
}

.tour-detail-header {
  display: flex;
  gap: 18px;
  justify-content: space-between;
  align-items: flex-start;
  padding-bottom: 18px;
  border-bottom: 1px solid #e5eaf2;
}

.tour-detail-actions {
  display: flex;
  gap: 10px;
}

.tour-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 18px 0;
}

.tour-stats > div {
  display: grid;
  gap: 5px;
  padding: 14px;
  border: 1px solid #dce4ef;
  border-radius: 12px;
}

.tour-stats span {
  color: #71809a;
  font-size: 13px;
}

.tour-stats strong {
  color: #111c33;
  font-size: 22px;
}

.tour-members-table-wrap {
  overflow-x: auto;
  border: 1px solid #e1e7f0;
  border-radius: 12px;
}

.tour-members-table {
  width: 100%;
  min-width: 620px;
  border-collapse: collapse;
}

.tour-members-table th,
.tour-members-table td {
  padding: 13px 14px;
  border-bottom: 1px solid #edf1f6;
  text-align: left;
  vertical-align: middle;
}

.tour-members-table tr:last-child td {
  border-bottom: 0;
}

.tour-members-table th {
  background: #f8faff;
  color: #65728b;
  font-size: 12px;
  font-weight: 700;
}

.member-name {
  display: grid;
  gap: 3px;
}

.member-name strong {
  color: #111c33;
}

.member-name span {
  color: #748098;
  font-size: 12px;
}

.document-status-cell {
  width: 88px;
}

.document-status-cell span {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: #f1f4f8;
  color: #94a0b3;
  font-weight: 800;
}

.document-status-cell span.complete {
  background: #eaf8ef;
  color: #247a46;
}

.member-status {
  display: inline-flex;
  padding: 5px 9px;
  border-radius: 999px;
  background: #eef3ff;
  color: #27406c;
  font-size: 12px;
  font-weight: 650;
}

.tour-empty {
  display: grid;
  place-items: center;
  min-height: 120px;
  padding: 24px;
  color: #758198;
  text-align: center;
}

.tour-detail-empty {
  min-height: 420px;
}

.tour-members-empty {
  min-height: 180px;
  border: 1px dashed #d9e1ec;
  border-radius: 12px;
}

.tour-error {
  color: #c13515;
}

@media (max-width: 900px) {
  .create-tour-grid,
  .tour-layout {
    grid-template-columns: 1fr;
  }

  .tour-detail-header {
    flex-direction: column;
  }

  .tour-detail-actions {
    width: 100%;
  }

  .tour-detail-actions button {
    flex: 1;
  }

}
</style>
