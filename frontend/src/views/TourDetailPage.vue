<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  downloadTourCsv,
  getReviewQueue,
  getScanItemImageUrl,
  getTourDetail,
  reviewScanItem,
  type ReviewQueuePersonResponse,
  type ReviewScanItemRequest,
  type ScanItemResponse,
  type TourMemberResponse,
  type TourDetailResponse,
} from '../services/api'

const props = defineProps<{
  tourId: string
}>()

const emit = defineEmits<{
  navigate: [path: string]
}>()

interface DocumentCell {
  status: 'missing' | 'pending' | 'reviewed'
  item?: ScanItemResponse
}

interface OperationalRow {
  key: string
  nameZh: string
  nameEn: string
  birthDate: string | null
  gender: string
  documents: Record<string, DocumentCell>
  reviewPerson: ReviewQueuePersonResponse | null
}

const detail = ref<TourDetailResponse | null>(null)
const queue = ref<ReviewQueuePersonResponse[]>([])
const loading = ref(true)
const error = ref('')
const exporting = ref(false)

const reviewPerson = ref<ReviewQueuePersonResponse | null>(null)
const reviewDocumentIndex = ref(0)
const reviewSaving = ref(false)
const reviewError = ref('')
const reviewForm = ref<ReviewScanItemRequest>({
  nameZh: '',
  nameEn: '',
  birthDate: null,
  gender: '',
  nationality: null,
  documentNumber: '',
  issuingCountry: null,
  expiryDate: null,
})

function documentLabel(type: string) {
  if (type === 'PASSPORT') return '護照'
  if (type === 'TAIWAN_COMPATRIOT_PERMIT') return '台胞證'
  if (type === 'TAIWAN_NATIONAL_ID') return '身分證'
  return type
}

function identityKey(
  nameZh: string,
  birthDate: string | null,
  gender: string,
) {
  return [
    nameZh.replace(/\s+/g, ''),
    birthDate ?? '',
    gender.trim().toUpperCase(),
  ].join('|')
}

function latestDocument(
  person: ReviewQueuePersonResponse,
  type: string,
) {
  return person.documents
    .filter(document => document.documentType === type)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
}

function formalDocument(
  member: TourMemberResponse,
  type: string,
) {
  return member.documents.find(
    document =>
      document.documentType === type &&
      document.isCurrent,
  )
}

const rows = computed<OperationalRow[]>(() => {
  if (!detail.value) return []

  const required = detail.value.tour.requiredDocumentTypes
  const result: OperationalRow[] = []
  const stagedKeys = new Set<string>()

  for (const person of queue.value) {
    const key = identityKey(
      person.nameZh,
      person.birthDate,
      person.gender,
    )

    stagedKeys.add(key)

    const documents: Record<string, DocumentCell> = {}

    for (const type of required) {
      const item = latestDocument(person, type)

      documents[type] = item
        ? {
            status:
              item.reviewStatus === 'REVIEWED'
                ? 'reviewed'
                : 'pending',
            item,
          }
        : { status: 'missing' }
    }

    result.push({
      key: `draft:${person.draftPersonId}`,
      nameZh: person.nameZh || '待確認姓名',
      nameEn:
        person.documents.find(item => item.nameEn)?.nameEn ?? '',
      birthDate: person.birthDate,
      gender: person.gender,
      documents,
      reviewPerson: person,
    })
  }

  for (const member of detail.value.members) {
    const key = identityKey(
      member.nameZh,
      member.birthDate,
      member.gender,
    )

    if (stagedKeys.has(key)) continue

    const documents: Record<string, DocumentCell> = {}

    for (const type of required) {
      documents[type] = formalDocument(member, type)
        ? { status: 'reviewed' }
        : { status: 'missing' }
    }

    result.push({
      key: `traveler:${member.travelerId}`,
      nameZh: member.nameZh || member.nameEn || '未命名旅客',
      nameEn: member.nameEn,
      birthDate: member.birthDate,
      gender: member.gender,
      documents,
      reviewPerson: null,
    })
  }

  return result
})

function rowStatus(row: OperationalRow) {
  if (!detail.value) return ''

  const cells = detail.value.tour.requiredDocumentTypes
    .map(type => ({
      type,
      cell: row.documents[type],
    }))

  if (cells.some(({ cell }) => cell.status === 'pending')) {
    return '待審核'
  }

  const missing = cells
    .filter(({ cell }) => cell.status === 'missing')
    .map(({ type }) => documentLabel(type))

  return missing.length
    ? `缺${missing.join('、')}`
    : '完成'
}

function rowStatusClass(row: OperationalRow) {
  const status = rowStatus(row)

  if (status === '完成') return 'complete'
  if (status === '待審核') return 'pending'
  return 'missing'
}

function canReview(row: OperationalRow) {
  return row.reviewPerson?.documents.some(
    document => document.reviewStatus === 'PENDING',
  ) ?? false
}

async function load() {
  loading.value = true
  error.value = ''

  try {
    const [tour, reviewQueue] = await Promise.all([
      getTourDetail(props.tourId),
      getReviewQueue(props.tourId),
    ])

    if (!tour) {
      error.value = '找不到指定團別。'
      detail.value = null
      queue.value = []
      return
    }

    detail.value = tour
    queue.value = reviewQueue
  } catch (err) {
    error.value =
      err instanceof Error
        ? err.message
        : '團別資料載入失敗。'
  } finally {
    loading.value = false
  }
}

async function reloadQueue() {
  queue.value = await getReviewQueue(props.tourId)
  const tour = await getTourDetail(props.tourId)
  if (tour) detail.value = tour
}

async function exportCsv() {
  if (!detail.value || exporting.value) return

  exporting.value = true

  try {
    await downloadTourCsv(
      props.tourId,
      `${detail.value.tour.tourName}.csv`,
    )
  } catch (err) {
    error.value =
      err instanceof Error
        ? err.message
        : '匯出失敗。'
  } finally {
    exporting.value = false
  }
}

function openReview(person: ReviewQueuePersonResponse) {
  reviewPerson.value = person
  reviewDocumentIndex.value = Math.max(
    0,
    person.documents.findIndex(
      document => document.reviewStatus === 'PENDING',
    ),
  )
  reviewError.value = ''
}

function closeReview() {
  if (reviewSaving.value) return
  reviewPerson.value = null
  reviewError.value = ''
}

const currentDocument = computed(() =>
  reviewPerson.value?.documents[reviewDocumentIndex.value] ?? null,
)

const currentImageUrl = computed(() =>
  currentDocument.value
    ? getScanItemImageUrl(currentDocument.value.scanItemId)
    : '',
)

watch(
  currentDocument,
  (document) => {
    if (!document) return

    reviewForm.value = {
      nameZh: document.nameZh,
      nameEn: document.nameEn,
      birthDate: document.birthDate,
      gender: document.gender,
      nationality: document.nationality,
      documentNumber: document.documentNumber,
      issuingCountry: document.issuingCountry,
      expiryDate: document.expiryDate,
    }
  },
  { immediate: true },
)

function selectReviewDocument(index: number) {
  reviewDocumentIndex.value = index
  reviewError.value = ''
}

function firstPendingPerson(
  excludingItemId?: string,
) {
  return queue.value.find(person =>
    person.documents.some(
      document =>
        document.reviewStatus === 'PENDING' &&
        document.scanItemId !== excludingItemId,
    ),
  ) ?? null
}

async function saveReview(moveNext: boolean) {
  const document = currentDocument.value
  if (!document || reviewSaving.value) return

  reviewSaving.value = true
  reviewError.value = ''

  try {
    await reviewScanItem(
      document.scanItemId,
      reviewForm.value,
    )

    await reloadQueue()

    if (moveNext) {
      const next = firstPendingPerson(document.scanItemId)

      if (!next) {
        reviewPerson.value = null
        return
      }

      openReview(next)
      return
    }

    const updatedParent = queue.value.find(person =>
      person.documents.some(
        item => item.scanItemId === document.scanItemId,
      ),
    )

    if (!updatedParent) {
      reviewPerson.value = null
      return
    }

    reviewPerson.value = updatedParent
    const updatedIndex = updatedParent.documents.findIndex(
      item => item.scanItemId === document.scanItemId,
    )
    reviewDocumentIndex.value = Math.max(0, updatedIndex)
  } catch (err) {
    reviewError.value =
      err instanceof Error
        ? err.message
        : '審核儲存失敗。'
  } finally {
    reviewSaving.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="page">
    <button
      type="button"
      class="back-link"
      @click="emit('navigate', '/tours')"
    >
      ← 返回團別管理
    </button>

    <div v-if="loading" class="state-card">
      正在載入團別資料…
    </div>

    <div v-else-if="error && !detail" class="state-card error-state">
      {{ error }}
    </div>

    <template v-else-if="detail">
      <header class="tour-header">
        <div>
          <p class="page-kicker">TOUR WORKSPACE</p>
          <h1>{{ detail.tour.tourName }}</h1>
          <p>
            {{ detail.tour.departureDate }}
            →
            {{ detail.tour.returnDate }}
          </p>

          <div class="required-documents">
            <span
              v-for="type in detail.tour.requiredDocumentTypes"
              :key="type"
            >
              {{ documentLabel(type) }}
            </span>
          </div>
        </div>

        <div class="header-actions">
          <button
            type="button"
            class="secondary-action"
            :disabled="exporting"
            @click="exportCsv"
          >
            {{ exporting ? '匯出中…' : '匯出 CSV' }}
          </button>
          <button
            type="button"
            class="primary-action"
            @click="
              emit(
                'navigate',
                `/tours/${detail.tour.tourId}/scan`,
              )
            "
          >
            ＋ 批次上傳證件
          </button>
        </div>
      </header>

      <div class="summary-grid">
        <div>
          <span>目前人數</span>
          <strong>{{ detail.tour.memberCount }}</strong>
        </div>
        <div>
          <span>已收證件</span>
          <strong>{{ detail.tour.receivedDocumentCount }}</strong>
        </div>
        <div>
          <span>待審核</span>
          <strong>{{ detail.tour.pendingReviewCount }}</strong>
        </div>
      </div>

      <p v-if="error" class="error-message">{{ error }}</p>

      <section class="member-card">
        <header>
          <div>
            <h2>旅客證件</h2>
            <p>批次 OCR 完成後會直接出現在這裡，人工覆核可稍後進行。</p>
          </div>
          <span>{{ rows.length }} 人</span>
        </header>

        <div v-if="!rows.length" class="state-card table-empty">
          <strong>這個團目前還沒有證件資料</strong>
          <span>按「批次上傳證件」開始收件。</span>
        </div>

        <div v-else class="table-wrap">
          <table>
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
                <th class="action-column"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in rows"
                :key="row.key"
              >
                <td>
                  <div class="person-name">
                    <strong>{{ row.nameZh }}</strong>
                    <span v-if="row.nameEn">{{ row.nameEn }}</span>
                    <small>
                      {{ row.birthDate ?? '生日待確認' }}
                      <template v-if="row.gender">
                        · {{ row.gender }}
                      </template>
                    </small>
                  </div>
                </td>

                <td
                  v-for="type in detail.tour.requiredDocumentTypes"
                  :key="type"
                >
                  <span
                    class="document-status"
                    :class="row.documents[type].status"
                  >
                    {{
                      row.documents[type].status === 'reviewed'
                        ? '已審核'
                        : row.documents[type].status === 'pending'
                          ? '待審核'
                          : '未收到'
                    }}
                  </span>
                </td>

                <td>
                  <span
                    class="row-status"
                    :class="rowStatusClass(row)"
                  >
                    {{ rowStatus(row) }}
                  </span>
                </td>

                <td class="action-cell">
                  <button
                    v-if="canReview(row) && row.reviewPerson"
                    type="button"
                    class="review-button"
                    @click="openReview(row.reviewPerson)"
                  >
                    審核
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <div
      v-if="reviewPerson && currentDocument"
      class="modal-backdrop"
    >
      <section
        class="review-modal"
        role="dialog"
        aria-modal="true"
      >
        <header class="review-header">
          <div>
            <p class="page-kicker">DOCUMENT REVIEW</p>
            <h2>{{ reviewPerson.nameZh || '待確認旅客' }}</h2>
          </div>

          <button
            type="button"
            class="close-button"
            :disabled="reviewSaving"
            @click="closeReview"
          >
            ×
          </button>
        </header>

        <div class="document-tabs">
          <button
            v-for="(document, index) in reviewPerson.documents"
            :key="document.scanItemId"
            type="button"
            :class="{
              active: index === reviewDocumentIndex,
              reviewed: document.reviewStatus === 'REVIEWED',
            }"
            @click="selectReviewDocument(index)"
          >
            {{ documentLabel(document.documentType) }}
            <span>
              {{
                document.reviewStatus === 'REVIEWED'
                  ? '✓'
                  : '●'
              }}
            </span>
          </button>
        </div>

        <div class="review-layout">
          <div class="review-image-panel">
            <img
              :src="currentImageUrl"
              :alt="`${documentLabel(currentDocument.documentType)}證件照片`"
            />
          </div>

          <div class="review-form">
            <label>
              <span>中文姓名</span>
              <input v-model="reviewForm.nameZh" type="text" />
            </label>

            <label v-if="currentDocument.documentType === 'PASSPORT'">
              <span>英文姓名</span>
              <input v-model="reviewForm.nameEn" type="text" />
            </label>

            <div class="two-column">
              <label>
                <span>出生日期</span>
                <input
                  v-model="reviewForm.birthDate"
                  type="date"
                />
              </label>

              <label>
                <span>性別</span>
                <select v-model="reviewForm.gender">
                  <option value="">待確認</option>
                  <option value="M">M</option>
                  <option value="F">F</option>
                  <option value="X">X</option>
                </select>
              </label>
            </div>

            <label>
              <span>{{ documentLabel(currentDocument.documentType) }}號碼</span>
              <input
                v-model="reviewForm.documentNumber"
                type="text"
              />
            </label>

            <template v-if="currentDocument.documentType === 'PASSPORT'">
              <div class="two-column">
                <label>
                  <span>國籍</span>
                  <input
                    v-model="reviewForm.nationality"
                    type="text"
                  />
                </label>
                <label>
                  <span>簽發國</span>
                  <input
                    v-model="reviewForm.issuingCountry"
                    type="text"
                  />
                </label>
              </div>
            </template>

            <label
              v-if="currentDocument.documentType !== 'TAIWAN_NATIONAL_ID'"
            >
              <span>有效期限</span>
              <input
                v-model="reviewForm.expiryDate"
                type="date"
              />
            </label>

            <p class="merge-note">
              儲存後系統會以中文姓名、出生日期、性別重新比對；
              完全相同的多張證件會自動歸到同一位旅客，不需要人工合併。
            </p>

            <p v-if="reviewError" class="error-message">
              {{ reviewError }}
            </p>
          </div>
        </div>

        <footer class="review-footer">
          <button
            type="button"
            class="secondary-action"
            :disabled="reviewSaving"
            @click="saveReview(false)"
          >
            {{ reviewSaving ? '儲存中…' : '儲存審核' }}
          </button>

          <button
            type="button"
            class="primary-action"
            :disabled="reviewSaving"
            @click="saveReview(true)"
          >
            儲存並審核下一位 →
          </button>
        </footer>
      </section>
    </div>
  </section>
</template>

<style scoped>
.page {
  display: grid;
  gap: 22px;
}

.back-link {
  justify-self: start;
  padding: 0;
  border: 0;
  background: transparent;
  color: #53627a;
  font-weight: 700;
  cursor: pointer;
}

.tour-header {
  display: flex;
  gap: 24px;
  align-items: flex-start;
  justify-content: space-between;
}

.tour-header h1 {
  margin: 2px 0 6px;
  color: #172033;
  font-size: 30px;
}

.tour-header p:not(.page-kicker) {
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

.header-actions {
  display: flex;
  gap: 9px;
}

.primary-action,
.secondary-action,
.review-button,
.close-button {
  border-radius: 10px;
  font: inherit;
  cursor: pointer;
}

.primary-action {
  min-height: 42px;
  padding: 0 16px;
  border: 0;
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

.required-documents {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.required-documents span {
  padding: 5px 9px;
  border-radius: 999px;
  background: #eef2f8;
  color: #40516d;
  font-size: 12px;
  font-weight: 650;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 180px));
  gap: 10px;
}

.summary-grid div {
  display: grid;
  gap: 4px;
  padding: 14px 16px;
  border: 1px solid #dde4ee;
  border-radius: 13px;
  background: #fff;
}

.summary-grid span {
  color: #738095;
  font-size: 12px;
}

.summary-grid strong {
  color: #172033;
  font-size: 24px;
}

.member-card {
  overflow: hidden;
  border: 1px solid #dce3ed;
  border-radius: 16px;
  background: #fff;
}

.member-card > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 18px 20px;
  border-bottom: 1px solid #e7ecf2;
}

.member-card h2 {
  margin: 0 0 4px;
  color: #172033;
  font-size: 17px;
}

.member-card p {
  margin: 0;
  color: #788497;
  font-size: 12px;
}

.member-card > header > span {
  color: #718096;
  font-size: 12px;
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  min-width: 760px;
  border-collapse: collapse;
}

th,
td {
  padding: 13px 16px;
  border-bottom: 1px solid #edf1f5;
  text-align: left;
  vertical-align: middle;
}

th {
  background: #f8f9fb;
  color: #6c788b;
  font-size: 12px;
}

td {
  color: #445064;
  font-size: 13px;
}

tbody tr:last-child td {
  border-bottom: 0;
}

.person-name {
  display: grid;
  gap: 2px;
}

.person-name strong {
  color: #172033;
}

.person-name span,
.person-name small {
  color: #7b8799;
  font-size: 11px;
}

.document-status,
.row-status {
  display: inline-flex;
  padding: 5px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.document-status.reviewed,
.row-status.complete {
  background: #eaf7ef;
  color: #237447;
}

.document-status.pending,
.row-status.pending {
  background: #fff4dc;
  color: #946515;
}

.document-status.missing,
.row-status.missing {
  background: #f1f3f6;
  color: #748094;
}

.action-column {
  width: 86px;
}

.action-cell {
  text-align: right;
}

.review-button {
  min-height: 34px;
  padding: 0 12px;
  border: 0;
  background: #172033;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}

.state-card {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 6px;
  min-height: 220px;
  color: #788497;
}

.table-empty {
  min-height: 200px;
}

.error-state,
.error-message {
  color: #bd3328;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgb(15 23 42 / 58%);
  z-index: 100;
}

.review-modal {
  width: min(1120px, 100%);
  max-height: calc(100vh - 40px);
  overflow: auto;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 28px 80px rgb(15 23 42 / 30%);
}

.review-header {
  position: sticky;
  top: 0;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 12px;
  background: #fff;
}

.review-header h2 {
  margin: 2px 0 0;
  color: #172033;
}

.close-button {
  width: 38px;
  height: 38px;
  border: 0;
  background: #f0f3f7;
  color: #344158;
  font-size: 22px;
}

.document-tabs {
  display: flex;
  gap: 7px;
  padding: 0 20px 14px;
  border-bottom: 1px solid #e5eaf1;
}

.document-tabs button {
  display: flex;
  gap: 7px;
  align-items: center;
  min-height: 36px;
  padding: 0 11px;
  border: 1px solid #d6deea;
  border-radius: 9px;
  background: #fff;
  color: #526077;
}

.document-tabs button.active {
  border-color: #172033;
  background: #172033;
  color: #fff;
}

.document-tabs button.reviewed:not(.active) {
  background: #edf8f1;
  color: #2d7750;
}

.review-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(360px, .92fr);
  min-height: 550px;
}

.review-image-panel {
  display: grid;
  place-items: center;
  min-height: 520px;
  overflow: hidden;
  padding: 20px;
  background: #111827;
}

.review-image-panel img {
  max-width: 100%;
  max-height: 68vh;
  object-fit: contain;
}

.review-form {
  align-content: start;
  display: grid;
  gap: 14px;
  padding: 22px;
}

.review-form label {
  display: grid;
  gap: 6px;
  color: #435169;
  font-size: 12px;
  font-weight: 700;
}

.review-form input,
.review-form select {
  min-height: 42px;
  padding: 0 11px;
  border: 1px solid #cfd8e5;
  border-radius: 9px;
  background: #fff;
  font: inherit;
}

.two-column {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.merge-note {
  padding: 10px 12px;
  border-radius: 10px;
  background: #f5f7fa;
  color: #657187 !important;
  line-height: 1.6;
}

.review-footer {
  position: sticky;
  bottom: 0;
  display: flex;
  gap: 9px;
  justify-content: flex-end;
  padding: 14px 20px;
  border-top: 1px solid #e5eaf1;
  background: #fff;
}

@media (max-width: 820px) {
  .tour-header,
  .header-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .summary-grid {
    grid-template-columns: repeat(3, 1fr);
  }

  .review-layout {
    grid-template-columns: 1fr;
  }

  .review-image-panel {
    min-height: 300px;
  }
}
</style>
