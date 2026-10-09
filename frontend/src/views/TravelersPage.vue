<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  convertTraditionalNameToSimplified,
} from '../services/nameScriptConversion'
import {
  getTravelerDetail,
  mergeTravelers,
  searchTravelers,
  updateTraveler,
  type TravelerDetailResponse,
  type TravelerSummaryResponse,
  type UpdateTravelerRequest,
} from '../services/api'

const travelers = ref<TravelerSummaryResponse[]>([])
const search = ref('')
const documentTypeFilter = ref('')
const genderFilter = ref('')
const nationalityFilter = ref('')
const page = ref(0)
const pageSize = 50
const hasNextPage = ref(false)
const loading = ref(true)
const error = ref('')
const editOpen = ref(false)
const editSaving = ref(false)
const editError = ref('')
const editingTraveler =
  ref<TravelerDetailResponse | null>(null)
const editForm = ref<UpdateTravelerRequest>({
  nameZh: '',
  nameEn: '',
  birthDate: '',
  gender: '',
  nationality: null,
  nationalIdNumber: null,
  documents: [],
})

const mergeOpen = ref(false)
const mergeSaving = ref(false)
const mergeSearching = ref(false)
const mergeError = ref('')
const mergeQuery = ref('')
const mergeAcknowledged = ref(false)
const mergeTarget =
  ref<TravelerDetailResponse | null>(null)
const mergeSource =
  ref<TravelerDetailResponse | null>(null)
const mergeCandidates =
  ref<TravelerSummaryResponse[]>([])

const mergeBlockedReason = computed(() => {
  const target = mergeTarget.value?.traveler
  const source = mergeSource.value?.traveler

  if (!target || !source) return ''

  if (target.birthDate !== source.birthDate) {
    return '出生日期不同，請先修正資料後再合併。'
  }

  if (target.gender !== source.gender) {
    return '性別不同，請先修正資料後再合併。'
  }

  if (
    target.nationalIdNumber &&
    source.nationalIdNumber &&
    target.nationalIdNumber !==
      source.nationalIdNumber
  ) {
    return '兩筆都有身分證字號且內容不同，為避免誤合併，請先確認並修正資料。'
  }

  return ''
})

const historicalDocuments = computed(
  () =>
    editingTraveler.value?.documents.filter(
      document => !document.isCurrent,
    ) ?? [],
)

function documentLabel(type: string) {
  if (type === 'PASSPORT') return '護照'
  if (type === 'TAIWAN_COMPATRIOT_PERMIT') return '台胞證'
  if (type === 'TAIWAN_NATIONAL_ID') return '身分證'
  return type
}

function formatDateTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function editingDocumentType(
  documentVersionId: string,
) {
  return (
    editingTraveler.value?.documents.find(
      document =>
        document.documentVersionId ===
        documentVersionId,
    )?.documentType ?? ''
  )
}

async function openEdit(
  traveler: TravelerSummaryResponse,
) {
  editError.value = ''

  try {
    const detail = await getTravelerDetail(
      traveler.travelerId,
    )

    if (!detail) {
      throw new Error('找不到旅客資料。')
    }

    editingTraveler.value = detail
    editForm.value = {
      nameZh: detail.traveler.nameZh,
      nameEn: detail.traveler.nameEn,
      birthDate: detail.traveler.birthDate,
      gender: detail.traveler.gender,
      nationality: detail.traveler.nationality,
      nationalIdNumber:
        detail.traveler.nationalIdNumber,
      documents: detail.documents
        .filter(document => document.isCurrent)
        .map(document => ({
          documentVersionId:
            document.documentVersionId,
          nameZhOnDocument:
            document.nameZhOnDocument,
          nameEnOnDocument:
            document.nameEnOnDocument,
          documentNumber:
            document.documentNumber,
          issuingCountry:
            document.issuingCountry,
          nationality:
            document.nationality,
          expiryDate:
            document.expiryDate,
        })),
    }
    editOpen.value = true
  } catch (err) {
    error.value =
      err instanceof Error
        ? err.message
        : '旅客資料載入失敗。'
  }
}

function closeEdit() {
  if (editSaving.value) return
  editOpen.value = false
  editingTraveler.value = null
  editError.value = ''
}

async function saveEdit() {
  if (
    !editingTraveler.value ||
    editSaving.value
  ) {
    return
  }

  editError.value = ''

  if (!editForm.value.nameZh.trim()) {
    editError.value = '中文姓名不可空白。'
    return
  }

  if (!editForm.value.birthDate) {
    editError.value = '請確認出生日期。'
    return
  }

  if (!editForm.value.gender) {
    editError.value = '請確認性別。'
    return
  }

  editSaving.value = true

  try {
    const request: UpdateTravelerRequest = {
      ...editForm.value,
      documents: editForm.value.documents.map(
        document => ({
          ...document,
          nameZhOnDocument:
            editingDocumentType(
              document.documentVersionId,
            ) === 'TAIWAN_COMPATRIOT_PERMIT'
              ? convertTraditionalNameToSimplified(
                  editForm.value.nameZh,
                )
              : document.nameZhOnDocument,
        }),
      ),
    }

    await updateTraveler(
      editingTraveler.value.traveler.travelerId,
      request,
    )
    editOpen.value = false
    editingTraveler.value = null
    await load()
  } catch (err) {
    editError.value =
      err instanceof Error
        ? err.message
        : '旅客資料更新失敗。'
  } finally {
    editSaving.value = false
  }
}

async function searchMergeCandidates() {
  const targetId =
    mergeTarget.value?.traveler.travelerId

  if (
    !targetId ||
    !mergeQuery.value.trim()
  ) {
    mergeCandidates.value = []
    return
  }

  mergeSearching.value = true
  mergeError.value = ''

  try {
    const rows = await searchTravelers(
      mergeQuery.value,
      12,
    )

    mergeCandidates.value =
      rows.filter(
        traveler =>
          traveler.travelerId !== targetId,
      )
  } catch (err) {
    mergeError.value =
      err instanceof Error
        ? err.message
        : '旅客搜尋失敗。'
  } finally {
    mergeSearching.value = false
  }
}

async function openMerge(
  traveler: TravelerSummaryResponse,
) {
  mergeError.value = ''
  mergeSource.value = null
  mergeCandidates.value = []
  mergeAcknowledged.value = false
  mergeQuery.value = traveler.nameZh

  try {
    const detail = await getTravelerDetail(
      traveler.travelerId,
    )

    if (!detail) {
      throw new Error('找不到要保留的旅客資料。')
    }

    mergeTarget.value = detail
    mergeOpen.value = true
    await searchMergeCandidates()
  } catch (err) {
    error.value =
      err instanceof Error
        ? err.message
        : '旅客資料載入失敗。'
  }
}

function closeMerge() {
  if (mergeSaving.value) return

  mergeOpen.value = false
  mergeTarget.value = null
  mergeSource.value = null
  mergeCandidates.value = []
  mergeQuery.value = ''
  mergeAcknowledged.value = false
  mergeError.value = ''
}

async function selectMergeSource(
  traveler: TravelerSummaryResponse,
) {
  mergeError.value = ''
  mergeAcknowledged.value = false

  try {
    const detail = await getTravelerDetail(
      traveler.travelerId,
    )

    if (!detail) {
      throw new Error('找不到要併入的旅客資料。')
    }

    mergeSource.value = detail
  } catch (err) {
    mergeError.value =
      err instanceof Error
        ? err.message
        : '旅客資料載入失敗。'
  }
}

async function confirmMerge() {
  const target = mergeTarget.value?.traveler
  const source = mergeSource.value?.traveler

  if (
    !target ||
    !source ||
    mergeSaving.value ||
    mergeBlockedReason.value ||
    !mergeAcknowledged.value
  ) {
    return
  }

  const confirmed = window.confirm(
    `確定把「${source.nameZh}」合併到「${target.nameZh}」嗎？來源 Traveler 主檔會被刪除，但證件版本與團別資料會移到保留 Traveler。此動作無法從畫面直接復原。`,
  )

  if (!confirmed) return

  mergeSaving.value = true
  mergeError.value = ''

  try {
    await mergeTravelers(
      target.travelerId,
      source.travelerId,
    )

    closeMerge()
    await load(true)
  } catch (err) {
    mergeError.value =
      err instanceof Error
        ? err.message
        : '旅客合併失敗。'
  } finally {
    mergeSaving.value = false
  }
}

async function load(
  resetPage = false,
) {
  if (resetPage) {
    page.value = 0
  }

  loading.value = true
  error.value = ''

  try {
    const rows = await searchTravelers(
      search.value,
      pageSize + 1,
      {
        documentType:
          documentTypeFilter.value,
        gender:
          genderFilter.value,
        nationality:
          nationalityFilter.value,
        offset:
          page.value * pageSize,
      },
    )

    hasNextPage.value =
      rows.length > pageSize
    travelers.value =
      rows.slice(0, pageSize)
  } catch (err) {
    error.value =
      err instanceof Error
        ? err.message
        : '旅客資料載入失敗。'
  } finally {
    loading.value = false
  }
}

function clearFilters() {
  search.value = ''
  documentTypeFilter.value = ''
  genderFilter.value = ''
  nationalityFilter.value = ''
  void load(true)
}

function previousPage() {
  if (page.value <= 0 || loading.value) {
    return
  }

  page.value -= 1
  void load()
}

function nextPage() {
  if (!hasNextPage.value || loading.value) {
    return
  }

  page.value += 1
  void load()
}

onMounted(() => load())
</script>

<template>
  <section class="page">
    <header class="page-header">
      <div>
        <p class="page-kicker">TRAVELERS</p>
        <h1>旅客資料</h1>
        <p>查看已完成人工審核並寫入正式主檔的旅客與證件。</p>
      </div>
    </header>

    <section class="filter-card">
      <div class="filter-main-row">
        <div class="search-box">
          <span>⌕</span>
          <input
            v-model="search"
            type="search"
            placeholder="搜尋姓名、身分證字號或證件號碼"
            @keyup.enter="load(true)"
          />
        </div>

        <button
          type="button"
          class="search-button"
          :disabled="loading"
          @click="load(true)"
        >
          搜尋
        </button>
      </div>

      <div class="filter-row">
        <label>
          <span>證件類別</span>
          <select v-model="documentTypeFilter">
            <option value="">全部證件</option>
            <option value="PASSPORT">護照</option>
            <option value="TAIWAN_COMPATRIOT_PERMIT">
              台胞證
            </option>
            <option value="TAIWAN_NATIONAL_ID">
              身分證
            </option>
          </select>
        </label>

        <label>
          <span>性別</span>
          <select v-model="genderFilter">
            <option value="">全部</option>
            <option value="M">M</option>
            <option value="F">F</option>
            <option value="X">X</option>
          </select>
        </label>

        <label>
          <span>國籍</span>
          <input
            v-model="nationalityFilter"
            type="text"
            placeholder="例如 TWN"
            @keyup.enter="load(true)"
          />
        </label>

        <div class="filter-actions">
          <button
            type="button"
            class="apply-filter-button"
            :disabled="loading"
            @click="load(true)"
          >
            套用條件
          </button>
          <button
            type="button"
            class="clear-filter-button"
            :disabled="loading"
            @click="clearFilters"
          >
            清除
          </button>
        </div>
      </div>
    </section>

    <p v-if="error" class="error-message">{{ error }}</p>

    <div class="table-card">
      <div v-if="loading" class="empty-state">
        正在載入旅客資料…
      </div>

      <div
        v-else-if="!travelers.length"
        class="empty-state"
      >
        尚無符合條件的正式旅客資料。
      </div>

      <table v-else>
        <thead>
          <tr>
            <th>姓名</th>
            <th>出生日期</th>
            <th>性別</th>
            <th>目前證件</th>
            <th>版本數</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="traveler in travelers"
            :key="traveler.travelerId"
          >
            <td>
              <div class="traveler-name">
                <strong>
                  {{ traveler.nameZh || traveler.nameEn || '未命名旅客' }}
                </strong>
                <span v-if="traveler.nameEn">
                  {{ traveler.nameEn }}
                </span>
              </div>
            </td>
            <td>{{ traveler.birthDate }}</td>
            <td>{{ traveler.gender || '—' }}</td>
            <td>
              <div class="document-tags">
                <span
                  v-for="type in traveler.currentDocumentTypes"
                  :key="type"
                >
                  {{ documentLabel(type) }}
                </span>
                <span v-if="!traveler.currentDocumentTypes.length">
                  無
                </span>
              </div>
            </td>
            <td>{{ traveler.documentVersionCount }}</td>
            <td class="action-cell">
              <div class="row-actions">
                <button
                  type="button"
                  class="merge-button"
                  @click="openMerge(traveler)"
                >
                  合併
                </button>
                <button
                  type="button"
                  class="edit-button"
                  @click="openEdit(traveler)"
                >
                  編輯
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-if="
        !loading &&
        (travelers.length || page > 0)
      "
      class="pagination-bar"
    >
      <span>
        第 {{ page + 1 }} 頁 ·
        本頁 {{ travelers.length }} 筆
      </span>

      <div>
        <button
          type="button"
          :disabled="page === 0 || loading"
          @click="previousPage"
        >
          上一頁
        </button>
        <button
          type="button"
          :disabled="!hasNextPage || loading"
          @click="nextPage"
        >
          下一頁
        </button>
      </div>
    </div>

    <div
      v-if="mergeOpen && mergeTarget"
      class="modal-backdrop"
      @click.self="closeMerge"
    >
      <section
        class="merge-modal"
        role="dialog"
        aria-modal="true"
      >
        <header>
          <div>
            <p class="page-kicker">MERGE TRAVELERS</p>
            <h2>人工合併旅客</h2>
            <p>
              保留左側 Traveler 主檔，將另一筆的證件版本與團別關聯併入。
            </p>
          </div>
          <button
            type="button"
            class="close-button"
            :disabled="mergeSaving"
            @click="closeMerge"
          >
            ×
          </button>
        </header>

        <div class="merge-target-card">
          <span class="merge-role keep">保留</span>
          <div>
            <strong>
              {{ mergeTarget.traveler.nameZh }}
            </strong>
            <span v-if="mergeTarget.traveler.nameEn">
              {{ mergeTarget.traveler.nameEn }}
            </span>
          </div>
          <dl>
            <div>
              <dt>出生日期</dt>
              <dd>{{ mergeTarget.traveler.birthDate }}</dd>
            </div>
            <div>
              <dt>性別</dt>
              <dd>{{ mergeTarget.traveler.gender }}</dd>
            </div>
            <div>
              <dt>身分證字號</dt>
              <dd>
                {{ mergeTarget.traveler.nationalIdNumber || '—' }}
              </dd>
            </div>
            <div>
              <dt>證件版本</dt>
              <dd>
                {{ mergeTarget.traveler.documentVersionCount }}
              </dd>
            </div>
          </dl>

          <div class="merge-document-list">
            <span
              v-for="document in mergeTarget.documents"
              :key="document.documentVersionId"
            >
              {{ documentLabel(document.documentType) }}
              · {{ document.documentNumber }}
              <template v-if="document.isCurrent">
                · 目前
              </template>
            </span>
          </div>
        </div>

        <div class="merge-search">
          <label>
            <span>搜尋要併入的另一筆旅客</span>
            <div>
              <input
                v-model="mergeQuery"
                type="search"
                placeholder="輸入姓名、身分證字號或證件號碼"
                @keyup.enter="searchMergeCandidates"
              />
              <button
                type="button"
                :disabled="mergeSearching"
                @click="searchMergeCandidates"
              >
                {{
                  mergeSearching
                    ? '搜尋中…'
                    : '搜尋'
                }}
              </button>
            </div>
          </label>

          <div
            v-if="mergeCandidates.length"
            class="merge-candidates"
          >
            <button
              v-for="candidate in mergeCandidates"
              :key="candidate.travelerId"
              type="button"
              :class="{
                selected:
                  mergeSource?.traveler.travelerId ===
                  candidate.travelerId,
              }"
              @click="selectMergeSource(candidate)"
            >
              <strong>{{ candidate.nameZh }}</strong>
              <span>
                {{ candidate.birthDate }}
                · {{ candidate.gender }}
                · 身分證
                {{ candidate.nationalIdNumber || '—' }}
                · {{ candidate.documentVersionCount }} 版本
              </span>
            </button>
          </div>

          <p
            v-else-if="
              mergeQuery.trim() &&
              !mergeSearching
            "
            class="merge-search-empty"
          >
            沒有找到其他符合條件的旅客。
          </p>
        </div>

        <div
          v-if="mergeSource"
          class="merge-source-card"
        >
          <span class="merge-role remove">
            併入後刪除
          </span>

          <div>
            <strong>
              {{ mergeSource.traveler.nameZh }}
            </strong>
            <span v-if="mergeSource.traveler.nameEn">
              {{ mergeSource.traveler.nameEn }}
            </span>
          </div>

          <dl>
            <div>
              <dt>出生日期</dt>
              <dd>{{ mergeSource.traveler.birthDate }}</dd>
            </div>
            <div>
              <dt>性別</dt>
              <dd>{{ mergeSource.traveler.gender }}</dd>
            </div>
            <div>
              <dt>身分證字號</dt>
              <dd>
                {{ mergeSource.traveler.nationalIdNumber || '—' }}
              </dd>
            </div>
            <div>
              <dt>證件版本</dt>
              <dd>
                {{ mergeSource.traveler.documentVersionCount }}
              </dd>
            </div>
          </dl>

          <div class="merge-document-list">
            <span
              v-for="document in mergeSource.documents"
              :key="document.documentVersionId"
            >
              {{ documentLabel(document.documentType) }}
              · {{ document.documentNumber }}
              <template v-if="document.isCurrent">
                · 目前
              </template>
            </span>
          </div>
        </div>

        <p
          v-if="mergeBlockedReason"
          class="merge-blocked"
        >
          {{ mergeBlockedReason }}
        </p>

        <p
          v-if="mergeError"
          class="error-message"
        >
          {{ mergeError }}
        </p>

        <label
          v-if="mergeSource && !mergeBlockedReason"
          class="merge-confirmation"
        >
          <input
            v-model="mergeAcknowledged"
            type="checkbox"
          />
          <span>
            我已確認這兩筆是同一位旅客，並知道來源 Traveler
            主檔會被刪除。
          </span>
        </label>

        <footer>
          <button
            type="button"
            class="cancel-button"
            :disabled="mergeSaving"
            @click="closeMerge"
          >
            取消
          </button>
          <button
            type="button"
            class="merge-confirm-button"
            :disabled="
              mergeSaving ||
              !mergeSource ||
              !!mergeBlockedReason ||
              !mergeAcknowledged
            "
            @click="confirmMerge"
          >
            {{
              mergeSaving
                ? '合併中…'
                : '確認合併'
            }}
          </button>
        </footer>
      </section>
    </div>

    <div
      v-if="editOpen && editingTraveler"
      class="modal-backdrop"
      @click.self="closeEdit"
    >
      <section
        class="edit-modal"
        role="dialog"
        aria-modal="true"
      >
        <header>
          <div>
            <p class="page-kicker">EDIT TRAVELER</p>
            <h2>編輯旅客資料</h2>
          </div>
          <button
            type="button"
            class="close-button"
            :disabled="editSaving"
            @click="closeEdit"
          >
            ×
          </button>
        </header>

        <div class="edit-form">
          <div class="two-column">
            <label>
              <span>中文姓名</span>
              <input
                v-model="editForm.nameZh"
                type="text"
              />
            </label>

            <label>
              <span>英文姓名</span>
              <input
                v-model="editForm.nameEn"
                type="text"
              />
            </label>
          </div>

          <div class="two-column">
            <label>
              <span>出生日期</span>
              <input
                v-model="editForm.birthDate"
                type="date"
              />
            </label>

            <label>
              <span>性別</span>
              <select v-model="editForm.gender">
                <option value="">待確認</option>
                <option value="M">M</option>
                <option value="F">F</option>
                <option value="X">X</option>
              </select>
            </label>
          </div>

          <div class="two-column">
            <label>
              <span>國籍</span>
              <input
                v-model="editForm.nationality"
                type="text"
              />
            </label>

            <label>
              <span>身分證字號</span>
              <input
                v-model="editForm.nationalIdNumber"
                type="text"
                maxlength="10"
              />
            </label>
          </div>

          <section class="documents-edit">
            <header>
              <strong>目前證件</strong>
              <span>
                可修正審核後才發現的證件資料。
              </span>
            </header>

            <article
              v-for="document in editForm.documents"
              :key="document.documentVersionId"
              class="document-edit-card"
            >
              <strong>
                {{
                  documentLabel(
                    editingTraveler.documents.find(
                      item =>
                        item.documentVersionId ===
                        document.documentVersionId,
                    )?.documentType ?? '',
                  )
                }}
              </strong>

              <div class="two-column">
                <label
                  v-if="
                    editingDocumentType(
                      document.documentVersionId,
                    ) !==
                    'TAIWAN_COMPATRIOT_PERMIT'
                  "
                >
                  <span>證件中文姓名</span>
                  <input
                    v-model="document.nameZhOnDocument"
                    type="text"
                  />
                </label>

                <div
                  v-else
                  class="derived-document-name"
                >
                  <span>台胞證中文姓名</span>
                  <strong>
                    {{
                      convertTraditionalNameToSimplified(
                        editForm.nameZh,
                      )
                    }}
                  </strong>
                  <small>
                    由旅客主檔繁體姓名自動轉為簡體，不另外維護第二個姓名。
                  </small>
                </div>

                <label>
                  <span>證件英文姓名</span>
                  <input
                    v-model="document.nameEnOnDocument"
                    type="text"
                  />
                </label>
              </div>

              <div class="three-column">
                <label>
                  <span>證件號碼</span>
                  <input
                    v-model="document.documentNumber"
                    type="text"
                  />
                </label>

                <label>
                  <span>簽發國</span>
                  <input
                    v-model="document.issuingCountry"
                    type="text"
                  />
                </label>

                <label>
                  <span>有效期限</span>
                  <input
                    v-model="document.expiryDate"
                    type="date"
                  />
                </label>
              </div>
            </article>
          </section>

          <section
            v-if="historicalDocuments.length"
            class="document-history"
          >
            <header>
              <div>
                <strong>歷史證件版本</strong>
                <span>
                  共 {{ historicalDocuments.length }} 個舊版本
                </span>
              </div>
              <small>
                舊版本只保留歷史紀錄，不會取代目前有效證件。
              </small>
            </header>

            <article
              v-for="document in historicalDocuments"
              :key="document.documentVersionId"
              class="history-card"
            >
              <div class="history-card-head">
                <strong>
                  {{ documentLabel(document.documentType) }}
                </strong>
                <span>歷史版本</span>
              </div>

              <dl>
                <div>
                  <dt>證件號碼</dt>
                  <dd>{{ document.documentNumber || '—' }}</dd>
                </div>
                <div>
                  <dt>證件姓名</dt>
                  <dd>
                    {{
                      document.nameZhOnDocument ||
                      document.nameEnOnDocument ||
                      '—'
                    }}
                  </dd>
                </div>
                <div>
                  <dt>有效期限</dt>
                  <dd>{{ document.expiryDate || '—' }}</dd>
                </div>
                <div>
                  <dt>最後確認</dt>
                  <dd>
                    {{ formatDateTime(document.verifiedAt) }}
                  </dd>
                </div>
              </dl>
            </article>
          </section>
        </div>

        <p
          v-if="editError"
          class="error-message"
        >
          {{ editError }}
        </p>

        <footer>
          <button
            type="button"
            class="cancel-button"
            :disabled="editSaving"
            @click="closeEdit"
          >
            取消
          </button>
          <button
            type="button"
            class="save-button"
            :disabled="editSaving"
            @click="saveEdit"
          >
            {{
              editSaving
                ? '儲存中…'
                : '儲存修改'
            }}
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

.page-header h1 {
  margin: 2px 0 6px;
  color: #172033;
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

.filter-card {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid #dce3ed;
  border-radius: 14px;
  background: #fff;
}

.filter-main-row {
  display: flex;
  gap: 10px;
}

.search-box {
  flex: 1;
  display: flex;
  gap: 8px;
  align-items: center;
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

.search-button,
.apply-filter-button,
.clear-filter-button,
.pagination-bar button {
  min-height: 40px;
  padding: 0 14px;
  border-radius: 9px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.search-button,
.apply-filter-button {
  border: 1px solid #172033;
  background: #172033;
  color: #fff;
}

.clear-filter-button,
.pagination-bar button {
  border: 1px solid #d5dce7;
  background: #fff;
  color: #334158;
}

.filter-row {
  display: grid;
  grid-template-columns:
    minmax(150px, 1fr)
    minmax(110px, .7fr)
    minmax(140px, .8fr)
    auto;
  gap: 10px;
  align-items: end;
}

.filter-row label {
  display: grid;
  gap: 5px;
  color: #647187;
  font-size: 11px;
  font-weight: 700;
}

.filter-row select,
.filter-row input {
  min-height: 40px;
  padding: 0 10px;
  border: 1px solid #d5dce7;
  border-radius: 9px;
  background: #fff;
  color: #344158;
  font: inherit;
}

.filter-actions {
  display: flex;
  gap: 8px;
}

.search-button:disabled,
.apply-filter-button:disabled,
.clear-filter-button:disabled,
.pagination-bar button:disabled {
  cursor: default;
  opacity: .5;
}

.table-card {
  overflow: hidden;
  border: 1px solid #dce3ed;
  border-radius: 16px;
  background: #fff;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: 14px 16px;
  border-bottom: 1px solid #edf1f5;
  text-align: left;
}

th {
  background: #f7f9fc;
  color: #68758a;
  font-size: 12px;
}

td {
  color: #3f4b5f;
  font-size: 13px;
}

tr:last-child td {
  border-bottom: 0;
}

.traveler-name {
  display: grid;
  gap: 3px;
}

.traveler-name strong {
  color: #172033;
}

.traveler-name span {
  color: #7a8799;
  font-size: 12px;
}

.document-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.document-tags span {
  padding: 4px 8px;
  border-radius: 999px;
  background: #eef2f8;
  color: #40516d;
  font-size: 11px;
  font-weight: 650;
}

.empty-state {
  display: grid;
  place-items: center;
  min-height: 260px;
  color: #7b8798;
}

.error-message {
  color: #bd3328;
}

@media (max-width: 860px) {
  .filter-main-row {
    align-items: stretch;
    flex-direction: column;
  }

  .filter-row {
    grid-template-columns: 1fr 1fr;
  }

  .filter-actions {
    align-self: end;
  }
}

@media (max-width: 720px) {
  .filter-row {
    grid-template-columns: 1fr;
  }

  .filter-actions {
    align-self: stretch;
  }

  .filter-actions > button {
    flex: 1;
  }

  .table-card {
    overflow-x: auto;
  }

  table {
    min-width: 720px;
  }
}

.pagination-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #6f7b8e;
  font-size: 12px;
}

.pagination-bar > div {
  display: flex;
  gap: 8px;
}

.action-cell {
  width: 72px;
  text-align: right;
}

.edit-button,
.cancel-button,
.save-button,
.close-button {
  border-radius: 9px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.edit-button {
  min-height: 31px;
  padding: 0 10px;
  border: 1px solid #d3dbe7;
  background: #fff;
  color: #344158;
  font-size: 11px;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgb(15 23 42 / 55%);
  backdrop-filter: blur(2px);
  z-index: 100;
}

.edit-modal {
  width: min(820px, 100%);
  max-height: calc(100vh - 40px);
  overflow: auto;
  padding: 20px;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 24px 70px rgb(15 23 42 / 24%);
}

.edit-modal > header,
.edit-modal > footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.edit-modal h2 {
  margin: 3px 0 0;
  color: #182236;
  font-size: 20px;
}

.close-button {
  width: 36px;
  height: 36px;
  border: 0;
  background: #f0f3f7;
  color: #435069;
  font-size: 20px;
}

.edit-form {
  display: grid;
  gap: 14px;
  margin-top: 18px;
}

.two-column,
.three-column {
  display: grid;
  gap: 10px;
}

.two-column {
  grid-template-columns: repeat(2, 1fr);
}

.three-column {
  grid-template-columns: repeat(3, 1fr);
}

.edit-form label {
  display: grid;
  gap: 5px;
  color: #46536a;
  font-size: 10px;
  font-weight: 700;
}

.edit-form input,
.edit-form select {
  min-height: 40px;
  padding: 0 10px;
  border: 1px solid #d0d9e5;
  border-radius: 8px;
  background: #fff;
  font: inherit;
}

.documents-edit {
  display: grid;
  gap: 10px;
  margin-top: 5px;
}

.documents-edit > header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.documents-edit > header strong {
  color: #27354b;
  font-size: 12px;
}

.documents-edit > header span {
  color: #8390a3;
  font-size: 9px;
}

.document-edit-card {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid #e0e5ec;
  border-radius: 10px;
  background: #fafbfc;
}

.derived-document-name {
  display: grid;
  gap: 4px;
  padding: 9px 10px;
  border: 1px solid #dce3eb;
  border-radius: 8px;
  background: #f5f7fa;
}

.derived-document-name span {
  color: #66748a;
  font-size: 10px;
  font-weight: 700;
}

.derived-document-name strong {
  color: #243249;
  font-size: 12px;
}

.derived-document-name small {
  color: #8692a3;
  font-size: 9px;
  line-height: 1.5;
}

.document-edit-card > strong {
  color: #334158;
  font-size: 11px;
}

.document-history {
  display: grid;
  gap: 10px;
  margin-top: 4px;
  padding-top: 14px;
  border-top: 1px solid #e8edf3;
}

.document-history > header {
  display: flex;
  gap: 16px;
  align-items: baseline;
  justify-content: space-between;
}

.document-history > header > div {
  display: flex;
  gap: 8px;
  align-items: baseline;
}

.document-history > header strong {
  color: #27354b;
  font-size: 12px;
}

.document-history > header span,
.document-history > header small {
  color: #8390a3;
  font-size: 9px;
}

.history-card {
  display: grid;
  gap: 9px;
  padding: 11px 12px;
  border: 1px solid #e3e7ed;
  border-radius: 10px;
  background: #f8f9fb;
}

.history-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.history-card-head strong {
  color: #344158;
  font-size: 11px;
}

.history-card-head span {
  padding: 3px 7px;
  border-radius: 999px;
  background: #eceff4;
  color: #778397;
  font-size: 9px;
  font-weight: 700;
}

.history-card dl {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin: 0;
}

.history-card dl > div {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.history-card dt {
  color: #8a95a5;
  font-size: 8px;
  font-weight: 700;
}

.history-card dd {
  overflow: hidden;
  margin: 0;
  color: #4a566a;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.edit-modal > footer {
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}

.cancel-button,
.save-button {
  min-height: 40px;
  padding: 0 14px;
}

.cancel-button {
  border: 1px solid #d5dce7;
  background: #fff;
  color: #334158;
}

.save-button {
  border: 1px solid #172033;
  background: #172033;
  color: #fff;
}

@media (max-width: 720px) {
  .two-column,
  .three-column,
  .history-card dl {
    grid-template-columns: 1fr;
  }

  .document-history > header {
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;
  }
}

</style>
