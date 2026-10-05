<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import {
  downloadTourCsv,
  getReviewQueue,
  getScanItemImageUrl,
  getTourDetail,
  reviewScanItem,
  type ReviewQueuePersonResponse,
  type ReviewScanItemRequest,
  type ScanItemResponse,
  type TourDetailResponse,
  type TourMemberResponse,
} from '../services/api'

const props = defineProps<{
  tourId: string
}>()

const emit = defineEmits<{
  navigate: [path: string]
}>()

type RowFilter =
  | 'all'
  | 'pending'
  | 'missing'
  | 'complete'

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

const tableSearch = ref('')
const rowFilter = ref<RowFilter>('all')

const reviewPerson =
  ref<ReviewQueuePersonResponse | null>(null)
const reviewDocumentIndex = ref(0)
const reviewSaving = ref(false)
const reviewError = ref('')
const reviewZoom = ref(1)
const reviewUseForTraining = ref(false)
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
  if (type === 'TAIWAN_COMPATRIOT_PERMIT') {
    return '台胞證'
  }
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
    .filter(
      document => document.documentType === type,
    )
    .sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt),
    )[0]
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

  const required =
    detail.value.tour.requiredDocumentTypes
  const result: OperationalRow[] = []
  const stagedKeys = new Set<string>()

  for (const person of queue.value) {
    const key = identityKey(
      person.nameZh,
      person.birthDate,
      person.gender,
    )

    stagedKeys.add(key)

    const documents:
      Record<string, DocumentCell> = {}

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
        person.documents.find(item => item.nameEn)
          ?.nameEn ?? '',
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

    const documents:
      Record<string, DocumentCell> = {}

    for (const type of required) {
      documents[type] = formalDocument(member, type)
        ? { status: 'reviewed' }
        : { status: 'missing' }
    }

    result.push({
      key: `traveler:${member.travelerId}`,
      nameZh:
        member.nameZh ||
        member.nameEn ||
        '未命名旅客',
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

  const cells =
    detail.value.tour.requiredDocumentTypes.map(
      type => ({
        type,
        cell: row.documents[type],
      }),
    )

  if (
    cells.some(
      ({ cell }) => cell.status === 'pending',
    )
  ) {
    return '待審核'
  }

  const missing = cells
    .filter(
      ({ cell }) => cell.status === 'missing',
    )
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

const rowCounts = computed(() => ({
  all: rows.value.length,
  pending: rows.value.filter(
    row => rowStatusClass(row) === 'pending',
  ).length,
  missing: rows.value.filter(
    row => rowStatusClass(row) === 'missing',
  ).length,
  complete: rows.value.filter(
    row => rowStatusClass(row) === 'complete',
  ).length,
}))

const filteredRows = computed(() => {
  const query = tableSearch.value
    .trim()
    .toLowerCase()

  return rows.value.filter(row => {
    const status = rowStatusClass(row)

    if (
      rowFilter.value !== 'all' &&
      status !== rowFilter.value
    ) {
      return false
    }

    if (!query) return true

    return [
      row.nameZh,
      row.nameEn,
      row.birthDate ?? '',
      row.gender,
    ]
      .join(' ')
      .toLowerCase()
      .includes(query)
  })
})

function canReview(row: OperationalRow) {
  return (
    row.reviewPerson?.documents.some(
      document =>
        document.reviewStatus === 'PENDING',
    ) ?? false
  )
}

async function load() {
  loading.value = true
  error.value = ''

  try {
    const [tour, reviewQueue] =
      await Promise.all([
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
  queue.value = await getReviewQueue(
    props.tourId,
  )

  const tour = await getTourDetail(
    props.tourId,
  )

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

function resetReviewZoom() {
  reviewZoom.value = 1
}

function setReviewZoom(value: number) {
  reviewZoom.value =
    Math.min(
      3,
      Math.max(
        1,
        Math.round(value * 4) / 4,
      ),
    )
}

function zoomReviewIn() {
  setReviewZoom(reviewZoom.value + 0.25)
}

function zoomReviewOut() {
  setReviewZoom(reviewZoom.value - 0.25)
}

function onReviewWheel(event: WheelEvent) {
  if (!event.ctrlKey && !event.metaKey) return

  event.preventDefault()

  if (event.deltaY < 0) {
    zoomReviewIn()
  } else {
    zoomReviewOut()
  }
}

function openReview(
  person: ReviewQueuePersonResponse,
) {
  reviewPerson.value = person
  reviewDocumentIndex.value = Math.max(
    0,
    person.documents.findIndex(
      document =>
        document.reviewStatus === 'PENDING',
    ),
  )
  reviewError.value = ''
  resetReviewZoom()
}

function closeReview() {
  if (reviewSaving.value) return

  reviewPerson.value = null
  reviewError.value = ''
  resetReviewZoom()
}

const currentDocument = computed(() =>
  reviewPerson.value?.documents[
    reviewDocumentIndex.value
  ] ?? null,
)

const currentImageUrl = computed(() =>
  currentDocument.value
    ? getScanItemImageUrl(
        currentDocument.value.scanItemId,
      )
    : '',
)

const reviewFormErrors = computed(() => {
  const document = currentDocument.value
  const form = reviewForm.value
  const errors: string[] = []

  if (!form.nameZh.trim()) {
    errors.push('中文姓名不可空白。')
  }

  if (!form.birthDate) {
    errors.push('請確認出生日期。')
  }

  if (!form.gender) {
    errors.push('請確認性別。')
  }

  if (!form.documentNumber.trim()) {
    errors.push('證件號碼不可空白。')
  }

  if (document?.documentType === 'PASSPORT') {
    if (!form.nameEn.trim()) {
      errors.push('請確認英文姓名。')
    }

    if (!form.nationality?.trim()) {
      errors.push('請確認國籍。')
    }

    if (!form.issuingCountry?.trim()) {
      errors.push('請確認簽發國。')
    }

    if (!form.expiryDate) {
      errors.push('請確認護照有效期限。')
    }
  }

  if (
    document?.documentType ===
      'TAIWAN_COMPATRIOT_PERMIT' &&
    !form.expiryDate
  ) {
    errors.push('請確認台胞證有效期限。')
  }

  return errors
})

const canSaveReview = computed(
  () =>
    Boolean(currentDocument.value) &&
    reviewFormErrors.value.length === 0 &&
    !reviewSaving.value,
)

watch(
  currentDocument,
  document => {
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
      useForTraining: false,
    }

    reviewUseForTraining.value = false
    resetReviewZoom()
    reviewError.value = ''
  },
  { immediate: true },
)

function selectReviewDocument(index: number) {
  reviewDocumentIndex.value = index
  reviewError.value = ''
  resetReviewZoom()
}

function firstPendingPerson(
  excludingItemId?: string,
) {
  return (
    queue.value.find(person =>
      person.documents.some(
        document =>
          document.reviewStatus ===
            'PENDING' &&
          document.scanItemId !==
            excludingItemId,
      ),
    ) ?? null
  )
}

async function saveReview(moveNext: boolean) {
  const document = currentDocument.value

  if (!document || reviewSaving.value) return

  if (reviewFormErrors.value.length) {
    reviewError.value =
      reviewFormErrors.value.join(' ')
    return
  }

  reviewSaving.value = true
  reviewError.value = ''

  try {
    await reviewScanItem(
      document.scanItemId,
      {
        ...reviewForm.value,
        useForTraining:
          reviewUseForTraining.value,
      },
    )

    await reloadQueue()

    if (moveNext) {
      const next = firstPendingPerson(
        document.scanItemId,
      )

      if (!next) {
        reviewPerson.value = null
        return
      }

      openReview(next)
      return
    }

    const updatedParent =
      queue.value.find(person =>
        person.documents.some(
          item =>
            item.scanItemId ===
            document.scanItemId,
        ),
      )

    if (!updatedParent) {
      reviewPerson.value = null
      return
    }

    reviewPerson.value = updatedParent

    const updatedIndex =
      updatedParent.documents.findIndex(
        item =>
          item.scanItemId ===
          document.scanItemId,
      )

    reviewDocumentIndex.value =
      Math.max(0, updatedIndex)
  } catch (err) {
    reviewError.value =
      err instanceof Error
        ? err.message
        : '審核儲存失敗。'
  } finally {
    reviewSaving.value = false
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (
    event.key === 'Escape' &&
    reviewPerson.value &&
    !reviewSaving.value
  ) {
    closeReview()
  }
}

onMounted(() => {
  void load()
  window.addEventListener(
    'keydown',
    handleKeydown,
  )
})

onBeforeUnmount(() => {
  window.removeEventListener(
    'keydown',
    handleKeydown,
  )
})
</script>

<template>
  <section class="page">
    <button
      type="button"
      class="back-link"
      @click="emit('navigate', '/tours')"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m14 6-6 6 6 6" />
      </svg>
      返回團別管理
    </button>

    <div
      v-if="loading"
      class="state-card"
    >
      正在載入團別資料…
    </div>

    <div
      v-else-if="error && !detail"
      class="state-card error-state"
    >
      {{ error }}
    </div>

    <template v-else-if="detail">
      <header class="tour-header">
        <div>
          <p class="page-kicker">
            TOUR WORKSPACE
          </p>
          <h1>{{ detail.tour.tourName }}</h1>
          <p>
            {{ detail.tour.departureDate }}
            <span aria-hidden="true">→</span>
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
          <strong>
            {{ detail.tour.memberCount }}
          </strong>
        </div>
        <div>
          <span>已收證件</span>
          <strong>
            {{ detail.tour.receivedDocumentCount }}
          </strong>
        </div>
        <div
          :class="{
            attention:
              detail.tour.pendingReviewCount > 0,
          }"
        >
          <span>待審核</span>
          <strong>
            {{ detail.tour.pendingReviewCount }}
          </strong>
        </div>
      </div>

      <p
        v-if="error"
        class="error-message"
      >
        {{ error }}
      </p>

      <section class="member-card">
        <header class="member-header">
          <div>
            <h2>旅客證件</h2>
            <p>
              OCR 完成後會直接出現在這裡；可依狀態集中處理。
            </p>
          </div>

          <span>
            顯示 {{ filteredRows.length }}
            / {{ rows.length }} 人
          </span>
        </header>

        <div
          v-if="rows.length"
          class="member-toolbar"
        >
          <div class="member-search">
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                cx="11"
                cy="11"
                r="6.5"
              />
              <path d="m16 16 4 4" />
            </svg>

            <input
              v-model="tableSearch"
              type="search"
              placeholder="搜尋姓名、生日"
            />
          </div>

          <div class="filter-tabs">
            <button
              type="button"
              :class="{
                active: rowFilter === 'all',
              }"
              @click="rowFilter = 'all'"
            >
              全部
              <span>{{ rowCounts.all }}</span>
            </button>

            <button
              type="button"
              :class="{
                active: rowFilter === 'pending',
              }"
              @click="rowFilter = 'pending'"
            >
              待審核
              <span>{{ rowCounts.pending }}</span>
            </button>

            <button
              type="button"
              :class="{
                active: rowFilter === 'missing',
              }"
              @click="rowFilter = 'missing'"
            >
              缺件
              <span>{{ rowCounts.missing }}</span>
            </button>

            <button
              type="button"
              :class="{
                active: rowFilter === 'complete',
              }"
              @click="rowFilter = 'complete'"
            >
              完成
              <span>{{ rowCounts.complete }}</span>
            </button>
          </div>
        </div>

        <div
          v-if="!rows.length"
          class="state-card table-empty"
        >
          <strong>
            這個團目前還沒有證件資料
          </strong>
          <span>
            按「批次上傳證件」開始收件。
          </span>
        </div>

        <div
          v-else-if="!filteredRows.length"
          class="state-card table-empty"
        >
          <strong>沒有符合目前條件的旅客</strong>
          <span>
            清除搜尋或切換其他狀態篩選。
          </span>
        </div>

        <div
          v-else
          class="table-wrap"
        >
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
                v-for="row in filteredRows"
                :key="row.key"
              >
                <td>
                  <div class="person-name">
                    <strong>
                      {{ row.nameZh }}
                    </strong>
                    <span v-if="row.nameEn">
                      {{ row.nameEn }}
                    </span>
                    <small>
                      {{
                        row.birthDate ??
                        '生日待確認'
                      }}
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
                    :class="
                      row.documents[type].status
                    "
                  >
                    {{
                      row.documents[type].status ===
                        'reviewed'
                        ? '已審核'
                        : row.documents[type].status ===
                            'pending'
                          ? '待審核'
                          : '未收到'
                    }}
                  </span>
                </td>

                <td>
                  <span
                    class="row-status"
                    :class="
                      rowStatusClass(row)
                    "
                  >
                    {{ rowStatus(row) }}
                  </span>
                </td>

                <td class="action-cell">
                  <button
                    v-if="
                      canReview(row) &&
                      row.reviewPerson
                    "
                    type="button"
                    class="review-button"
                    @click="
                      openReview(
                        row.reviewPerson,
                      )
                    "
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
      v-if="
        reviewPerson &&
        currentDocument
      "
      class="modal-backdrop"
      @click.self="closeReview"
    >
      <section
        class="review-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-title"
      >
        <header class="review-header">
          <div>
            <p class="page-kicker">
              DOCUMENT REVIEW
            </p>
            <div class="review-title-line">
              <h2 id="review-title">
                {{
                  reviewPerson.nameZh ||
                  '待確認旅客'
                }}
              </h2>
              <span>
                {{
                  reviewPerson.documents.filter(
                    item =>
                      item.reviewStatus ===
                      'PENDING',
                  ).length
                }}
                張待審核
              </span>
            </div>
          </div>

          <button
            type="button"
            class="close-button"
            :disabled="reviewSaving"
            aria-label="關閉審核"
            @click="closeReview"
          >
            ×
          </button>
        </header>

        <div class="document-tabs">
          <button
            v-for="(
              document,
              index
            ) in reviewPerson.documents"
            :key="document.scanItemId"
            type="button"
            :class="{
              active:
                index ===
                reviewDocumentIndex,
              reviewed:
                document.reviewStatus ===
                'REVIEWED',
            }"
            @click="
              selectReviewDocument(index)
            "
          >
            {{
              documentLabel(
                document.documentType,
              )
            }}
            <span>
              {{
                document.reviewStatus ===
                  'REVIEWED'
                  ? '✓'
                  : '●'
              }}
            </span>
          </button>
        </div>

        <div class="review-layout">
          <div class="review-image-column">
            <div class="image-toolbar">
              <span>
                原始覆核圖
              </span>

              <div>
                <button
                  type="button"
                  :disabled="
                    reviewZoom <= 1
                  "
                  aria-label="縮小"
                  @click="zoomReviewOut"
                >
                  −
                </button>
                <button
                  type="button"
                  class="zoom-value"
                  @click="resetReviewZoom"
                >
                  {{
                    Math.round(
                      reviewZoom * 100,
                    )
                  }}%
                </button>
                <button
                  type="button"
                  :disabled="
                    reviewZoom >= 3
                  "
                  aria-label="放大"
                  @click="zoomReviewIn"
                >
                  ＋
                </button>
              </div>
            </div>

            <div
              class="review-image-panel"
              @wheel="onReviewWheel"
            >
              <img
                :src="currentImageUrl"
                :style="{
                  width:
                    `${reviewZoom * 100}%`,
                }"
                :alt="`${documentLabel(
                  currentDocument.documentType,
                )}證件照片`"
              />
            </div>

            <small class="zoom-help">
              可使用按鈕放大；Ctrl / ⌘
              + 滾輪也可以縮放。
            </small>
          </div>

          <div class="review-form">
            <div class="document-meta">
              <span>
                {{
                  documentLabel(
                    currentDocument.documentType,
                  )
                }}
              </span>
              <strong>
                {{
                  currentDocument.reviewStatus ===
                    'REVIEWED'
                    ? '已審核'
                    : '待審核'
                }}
              </strong>
            </div>

            <label>
              <span>中文姓名</span>
              <input
                v-model="reviewForm.nameZh"
                type="text"
              />
            </label>

            <label
              v-if="
                currentDocument.documentType ===
                'PASSPORT'
              "
            >
              <span>英文姓名</span>
              <input
                v-model="reviewForm.nameEn"
                type="text"
              />
            </label>

            <div class="two-column">
              <label>
                <span>出生日期</span>
                <input
                  v-model="
                    reviewForm.birthDate
                  "
                  type="date"
                />
              </label>

              <label>
                <span>性別</span>
                <select
                  v-model="
                    reviewForm.gender
                  "
                >
                  <option value="">
                    待確認
                  </option>
                  <option value="M">
                    M
                  </option>
                  <option value="F">
                    F
                  </option>
                  <option value="X">
                    X
                  </option>
                </select>
              </label>
            </div>

            <label>
              <span>
                {{
                  documentLabel(
                    currentDocument.documentType,
                  )
                }}號碼
              </span>
              <input
                v-model="
                  reviewForm.documentNumber
                "
                type="text"
              />
            </label>

            <template
              v-if="
                currentDocument.documentType ===
                'PASSPORT'
              "
            >
              <div class="two-column">
                <label>
                  <span>國籍</span>
                  <input
                    v-model="
                      reviewForm.nationality
                    "
                    type="text"
                    maxlength="3"
                  />
                </label>

                <label>
                  <span>簽發國</span>
                  <input
                    v-model="
                      reviewForm.issuingCountry
                    "
                    type="text"
                    maxlength="3"
                  />
                </label>
              </div>
            </template>

            <label
              v-if="
                currentDocument.documentType !==
                'TAIWAN_NATIONAL_ID'
              "
            >
              <span>有效期限</span>
              <input
                v-model="
                  reviewForm.expiryDate
                "
                type="date"
              />
            </label>

            <label class="training-option">
              <input
                v-model="reviewUseForTraining"
                type="checkbox"
              />
              <span class="training-check" aria-hidden="true">
                ✓
              </span>
              <span>
                <strong>保留此樣本供 OCR 改善</strong>
                <small>
                  勾選後，這張證件與人工確認答案會獨立複製到私人訓練資料集；正式收件照片原本的刪除期限不變。
                </small>
              </span>
            </label>

            <div class="merge-note">
              <strong>人物歸組由系統處理</strong>
              <span>
                儲存後會用中文姓名、出生日期、性別重新比對；
                完全相同的多張證件會自動歸到同一位旅客。
              </span>
            </div>

            <div
              v-if="
                reviewFormErrors.length &&
                !reviewError
              "
              class="form-warning"
            >
              還有
              {{ reviewFormErrors.length }}
              個必要欄位需要確認後才能儲存。
            </div>

            <p
              v-if="reviewError"
              class="error-message"
            >
              {{ reviewError }}
            </p>
          </div>
        </div>

        <footer class="review-footer">
          <span>
            Esc 可關閉視窗
          </span>

          <div>
            <button
              type="button"
              class="secondary-action"
              :disabled="!canSaveReview"
              @click="saveReview(false)"
            >
              {{
                reviewSaving
                  ? '儲存中…'
                  : '儲存審核'
              }}
            </button>

            <button
              type="button"
              class="primary-action"
              :disabled="!canSaveReview"
              @click="saveReview(true)"
            >
              儲存並審核下一位
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </footer>
      </section>
    </div>
  </section>
</template>

<style scoped>
.page {
  display: grid;
  gap: 21px;
}

.back-link {
  justify-self: start;
  display: inline-flex;
  gap: 5px;
  align-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: #647289;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.back-link svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.9;
}

.tour-header {
  display: flex;
  gap: 24px;
  align-items: flex-start;
  justify-content: space-between;
}

.tour-header h1 {
  margin: 3px 0 6px;
  color: #182236;
  font-size: 29px;
  letter-spacing: -.025em;
}

.tour-header p:not(.page-kicker) {
  display: flex;
  gap: 7px;
  align-items: center;
  margin: 0;
  color: #6f7b8e;
  font-size: 12px;
}

.page-kicker {
  margin: 0;
  color: #8792a3;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .14em;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.primary-action,
.secondary-action,
.review-button,
.close-button {
  border-radius: 9px;
  font: inherit;
  cursor: pointer;
}

.primary-action {
  min-height: 41px;
  padding: 0 15px;
  border: 1px solid #172033;
  background: #172033;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}

.secondary-action {
  min-height: 41px;
  padding: 0 14px;
  border: 1px solid #d5dce7;
  background: #fff;
  color: #334158;
  font-size: 12px;
  font-weight: 650;
}

.required-documents {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  margin-top: 11px;
}

.required-documents span {
  padding: 4px 8px;
  border-radius: 999px;
  background: #eef2f7;
  color: #4b5c77;
  font-size: 10px;
  font-weight: 700;
}

.summary-grid {
  display: grid;
  grid-template-columns:
    repeat(3, minmax(0, 170px));
  gap: 9px;
}

.summary-grid div {
  display: grid;
  gap: 4px;
  padding: 13px 15px;
  border: 1px solid #dde4ed;
  border-radius: 12px;
  background: #fff;
}

.summary-grid div.attention {
  border-color: #eeddb8;
  background: #fffaf1;
}

.summary-grid span {
  color: #778397;
  font-size: 10px;
}

.summary-grid strong {
  color: #1c2940;
  font-size: 22px;
  line-height: 1.1;
}

.summary-grid .attention strong {
  color: #956619;
}

.member-card {
  overflow: hidden;
  border: 1px solid #dde3ec;
  border-radius: 15px;
  background: #fff;
}

.member-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 17px 19px 13px;
}

.member-card h2 {
  margin: 0 0 4px;
  color: #182236;
  font-size: 16px;
}

.member-card p {
  margin: 0;
  color: #7a8698;
  font-size: 10px;
}

.member-header > span {
  color: #7b8799;
  font-size: 10px;
}

.member-toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  padding: 11px 13px;
  border-top: 1px solid #edf1f5;
  border-bottom: 1px solid #e7ecf2;
  background: #fafbfc;
}

.member-search {
  width: min(310px, 42%);
  display: flex;
  gap: 8px;
  align-items: center;
  min-height: 35px;
  padding: 0 10px;
  border: 1px solid #d9e0e9;
  border-radius: 8px;
  background: #fff;
}

.member-search svg {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
  fill: none;
  stroke: #8390a3;
  stroke-linecap: round;
  stroke-width: 1.8;
}

.member-search input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: #344158;
  font-size: 11px;
}

.filter-tabs {
  display: flex;
  gap: 4px;
  align-items: center;
}

.filter-tabs button {
  min-height: 32px;
  display: inline-flex;
  gap: 5px;
  align-items: center;
  padding: 0 9px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: #748095;
  font: inherit;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
}

.filter-tabs button:hover {
  background: #f0f3f7;
}

.filter-tabs button.active {
  border-color: #d4dce7;
  background: #fff;
  color: #334158;
  box-shadow: 0 1px 2px rgb(15 23 42 / 4%);
}

.filter-tabs span {
  min-width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: #eef2f6;
  font-size: 9px;
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  min-width: 0;
  border-collapse: collapse;
}

th,
td {
  padding: 12px 15px;
  border-bottom: 1px solid #edf1f5;
  text-align: left;
  vertical-align: middle;
}

th {
  background: #f8f9fb;
  color: #6d798d;
  font-size: 10px;
  font-weight: 750;
}

td {
  color: #445064;
  font-size: 11px;
}

tbody tr:hover {
  background: #fbfcfd;
}

tbody tr:last-child td {
  border-bottom: 0;
}

.person-name {
  display: grid;
  gap: 2px;
}

.person-name strong {
  color: #1f2c42;
  font-size: 12px;
}

.person-name span,
.person-name small {
  color: #7c8799;
  font-size: 9px;
}

.document-status,
.row-status {
  display: inline-flex;
  padding: 4px 7px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 750;
  white-space: nowrap;
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
  width: 76px;
}

.action-cell {
  text-align: right;
}

.review-button {
  min-height: 31px;
  padding: 0 10px;
  border: 1px solid #172033;
  background: #172033;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
}

.state-card {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 6px;
  min-height: 220px;
  color: #788497;
  font-size: 11px;
}

.table-empty {
  min-height: 190px;
  border-top: 1px solid #edf1f5;
}

.table-empty strong {
  color: #46536a;
}

.error-state,
.error-message {
  color: #bd3328;
}

.error-message {
  margin: 0;
  font-size: 10px;
  line-height: 1.5;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgb(15 23 42 / 60%);
  backdrop-filter: blur(3px);
  z-index: 100;
}

.review-modal {
  width: min(1160px, 100%);
  max-height: calc(100vh - 36px);
  overflow: auto;
  border: 1px solid #dfe5ed;
  border-radius: 17px;
  background: #fff;
  box-shadow:
    0 28px 80px rgb(15 23 42 / 30%);
}

.review-header {
  position: sticky;
  top: 0;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 17px 19px 11px;
  background: #fff;
}

.review-title-line {
  display: flex;
  gap: 9px;
  align-items: center;
  flex-wrap: wrap;
}

.review-header h2 {
  margin: 3px 0 0;
  color: #182236;
  font-size: 18px;
}

.review-title-line > span {
  padding: 3px 7px;
  border-radius: 999px;
  background: #fff3db;
  color: #906215;
  font-size: 9px;
  font-weight: 750;
}

.close-button {
  width: 36px;
  height: 36px;
  border: 0;
  background: #f0f3f7;
  color: #435069;
  font-size: 20px;
}

.document-tabs {
  display: flex;
  gap: 6px;
  padding: 0 19px 12px;
  overflow-x: auto;
  border-bottom: 1px solid #e5eaf1;
}

.document-tabs button {
  display: flex;
  gap: 6px;
  align-items: center;
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid #d7dfe9;
  border-radius: 8px;
  background: #fff;
  color: #5b687d;
  font: inherit;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.document-tabs button.active {
  border-color: #172033;
  background: #172033;
  color: #fff;
}

.document-tabs button.reviewed:not(.active) {
  border-color: #d5e9dd;
  background: #edf8f1;
  color: #2d7750;
}

.review-layout {
  display: grid;
  grid-template-columns:
    minmax(0, 1.08fr)
    minmax(350px, .92fr);
  min-height: 550px;
}

.review-image-column {
  min-width: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  padding: 14px;
  background: #111827;
}

.image-toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  min-height: 36px;
  padding-bottom: 10px;
  color: #aeb8c8;
  font-size: 10px;
}

.image-toolbar > div {
  display: flex;
  gap: 4px;
}

.image-toolbar button {
  min-width: 30px;
  height: 29px;
  border: 1px solid #334156;
  border-radius: 7px;
  background: #1b2638;
  color: #d6deea;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.image-toolbar button:disabled {
  opacity: .4;
  cursor: not-allowed;
}

.image-toolbar .zoom-value {
  min-width: 54px;
  font-size: 9px;
}

.review-image-panel {
  min-height: 470px;
  overflow: auto;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  border: 1px solid #273347;
  border-radius: 10px;
  background:
    linear-gradient(45deg, #131d2c 25%, transparent 25%),
    linear-gradient(-45deg, #131d2c 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #131d2c 75%),
    linear-gradient(-45deg, transparent 75%, #131d2c 75%),
    #0f1724;
  background-size: 20px 20px;
  background-position:
    0 0,
    0 10px,
    10px -10px,
    -10px 0;
}

.review-image-panel img {
  display: block;
  height: auto;
  min-width: 100%;
  max-width: none;
  object-fit: contain;
  transition: width .12s ease;
}

.zoom-help {
  padding-top: 8px;
  color: #7f8ca0;
  font-size: 9px;
}

.review-form {
  align-content: start;
  display: grid;
  gap: 12px;
  padding: 20px;
  background: #fff;
}

.document-meta {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 9px;
  border-bottom: 1px solid #edf1f5;
}

.document-meta span {
  color: #344258;
  font-size: 11px;
  font-weight: 750;
}

.document-meta strong {
  padding: 4px 7px;
  border-radius: 999px;
  background: #fff3db;
  color: #916314;
  font-size: 9px;
}

.review-form label {
  display: grid;
  gap: 5px;
  color: #46536a;
  font-size: 10px;
  font-weight: 700;
}

.review-form input,
.review-form select {
  min-height: 40px;
  padding: 0 10px;
  border: 1px solid #d0d9e5;
  border-radius: 8px;
  outline: 0;
  background: #fff;
  color: #2c394e;
  font: inherit;
  font-size: 11px;
}

.review-form input:focus,
.review-form select:focus {
  border-color: #98a7b9;
  box-shadow: 0 0 0 3px rgb(40 54 75 / 6%);
}

.two-column {
  display: grid;
  grid-template-columns:
    repeat(2, 1fr);
  gap: 9px;
}

.training-option {
  grid-template-columns: auto auto 1fr !important;
  gap: 8px !important;
  align-items: flex-start;
  padding: 11px;
  border: 1px solid #d7e5dc;
  border-radius: 9px;
  background: #f7fbf8;
  cursor: pointer;
}

.training-option > input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.training-check {
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  margin-top: 1px;
  border: 1px solid #bfcfc5;
  border-radius: 5px;
  background: #fff;
  color: transparent;
  font-size: 11px;
}

.training-option:has(input:checked) .training-check {
  border-color: #2f6e4b;
  background: #2f6e4b;
  color: #fff;
}

.training-option > span:last-child {
  display: grid;
  gap: 3px;
}

.training-option strong {
  color: #31563f;
  font-size: 10px;
}

.training-option small {
  color: #718278;
  font-size: 9px;
  line-height: 1.55;
}

.merge-note {
  display: grid;
  gap: 3px;
  padding: 10px 11px;
  border-radius: 9px;
  background: #f5f7fa;
  color: #657187;
}

.merge-note strong {
  color: #47556b;
  font-size: 10px;
}

.merge-note span {
  font-size: 9px;
  line-height: 1.6;
}

.form-warning {
  padding: 9px 10px;
  border: 1px solid #ead8b2;
  border-radius: 8px;
  background: #fff9ee;
  color: #8c6219;
  font-size: 9px;
  line-height: 1.5;
}

.review-footer {
  position: sticky;
  bottom: 0;
  display: flex;
  gap: 14px;
  align-items: center;
  justify-content: space-between;
  padding: 12px 19px;
  border-top: 1px solid #e5eaf1;
  background: #fff;
}

.review-footer > span {
  color: #8a95a5;
  font-size: 9px;
}

.review-footer > div {
  display: flex;
  gap: 8px;
}

button:disabled {
  cursor: not-allowed;
  opacity: .5;
}

@media (max-width: 900px) {
  .member-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .member-search {
    width: 100%;
  }

  .filter-tabs {
    overflow-x: auto;
  }

  .review-layout {
    grid-template-columns: 1fr;
  }

  .review-image-panel {
    min-height: 330px;
    max-height: 55vh;
  }
}

@media (max-width: 720px) {
  .table-wrap table {
    min-width: 680px;
  }

  .tour-header,
  .header-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .summary-grid {
    grid-template-columns:
      repeat(3, 1fr);
  }

  .review-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .review-footer > div {
    display: grid;
    grid-template-columns: 1fr;
  }

  .two-column {
    grid-template-columns: 1fr;
  }
}
</style>
