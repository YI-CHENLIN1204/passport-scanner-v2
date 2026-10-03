<script setup lang="ts">
import {
  onMounted,
  ref,
} from 'vue'
import {
  getDocumentStoreStatus,
  getTravelerDetail,
  searchTravelers,
  type DocumentStoreStatusResponse,
  type TravelerDetailResponse,
  type TravelerSummaryResponse,
} from '../services/api'

const status = ref<DocumentStoreStatusResponse | null>(null)
const travelers = ref<TravelerSummaryResponse[]>([])
const selected = ref<TravelerDetailResponse | null>(null)
const query = ref('')
const loading = ref(false)
const detailLoading = ref(false)
const error = ref('')

function documentTypeLabel(value: string) {
  if (value === 'PASSPORT') return '護照'
  if (value === 'TAIWAN_COMPATRIOT_PERMIT') return '台胞證'
  if (value === 'TAIWAN_NATIONAL_ID') return '台灣身分證'
  return value
}

function displayName(traveler: TravelerSummaryResponse) {
  return traveler.nameZh || traveler.nameEn || '未命名旅客'
}

async function refresh() {
  loading.value = true
  error.value = ''

  try {
    const [nextStatus, nextTravelers] =
      await Promise.all([
        getDocumentStoreStatus(),
        searchTravelers(query.value, 30),
      ])

    status.value = nextStatus
    travelers.value = nextTravelers

    if (
      selected.value &&
      !nextTravelers.some(
        (item) =>
          item.travelerId ===
          selected.value?.traveler.travelerId,
      )
    ) {
      selected.value = null
    }
  } catch (err) {
    error.value =
      err instanceof Error
        ? err.message
        : '無法讀取旅客資料。'
  } finally {
    loading.value = false
  }
}

async function selectTraveler(
  traveler: TravelerSummaryResponse,
) {
  detailLoading.value = true
  error.value = ''

  try {
    selected.value =
      await getTravelerDetail(traveler.travelerId)
  } catch (err) {
    error.value =
      err instanceof Error
        ? err.message
        : '無法讀取旅客詳細資料。'
  } finally {
    detailLoading.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <section class="traveler-workspace">
    <div class="workspace-heading">
      <div>
        <p class="eyebrow">CRM · Traveler archive</p>
        <h2>旅客資料</h2>
        <p>
          查看目前已完成人工覆核的旅客與證件版本。護照、台胞證與台灣身分證都會歸到同一位旅客主檔。
        </p>
      </div>

      <button
        type="button"
        :disabled="loading"
        @click="refresh"
      >
        {{ loading ? '更新中…' : '重新整理' }}
      </button>
    </div>

    <div class="persistent-notice">
      <strong>旅客資料已改為 PostgreSQL 持久化。</strong>
      <span>
        Docker 會把旅客主檔與證件版本寫入獨立資料庫 volume；重啟 frontend／backend 不會清空資料。
      </span>
    </div>

    <div class="stats-grid">
      <article>
        <span>旅客主檔</span>
        <strong>{{ status?.travelerCount ?? '—' }}</strong>
      </article>
      <article>
        <span>證件版本</span>
        <strong>{{ status?.documentVersionCount ?? '—' }}</strong>
      </article>
      <article>
        <span>目前儲存模式</span>
        <strong>PostgreSQL</strong>
      </article>
    </div>

    <div class="search-row">
      <input
        v-model="query"
        type="search"
        placeholder="搜尋中文姓名、英文姓名或證件號碼"
        @keyup.enter="refresh"
      />
      <button type="button" @click="refresh">
        搜尋
      </button>
    </div>

    <p v-if="error" class="workspace-error">
      {{ error }}
    </p>

    <div class="crm-layout">
      <div class="traveler-list">
        <div class="list-heading">
          <strong>旅客</strong>
          <span>{{ travelers.length }} 筆</span>
        </div>

        <button
          v-for="traveler in travelers"
          :key="traveler.travelerId"
          type="button"
          class="traveler-row"
          :class="{
            active:
              selected?.traveler.travelerId ===
              traveler.travelerId,
          }"
          @click="selectTraveler(traveler)"
        >
          <div>
            <strong>{{ displayName(traveler) }}</strong>
            <span v-if="traveler.nameZh && traveler.nameEn">
              {{ traveler.nameEn }}
            </span>
            <span>
              {{ traveler.birthDate }}
              <template v-if="traveler.nationality">
                · {{ traveler.nationality }}
              </template>
            </span>
          </div>

          <div class="row-meta">
            <span>
              {{ traveler.documentVersionCount }} 版本
            </span>
            <small>
              {{
                traveler.currentDocumentTypes
                  .map(documentTypeLabel)
                  .join(' · ') || '無目前證件'
              }}
            </small>
          </div>
        </button>

        <div
          v-if="!loading && !travelers.length"
          class="empty-state"
        >
          目前沒有符合條件的旅客資料。
        </div>
      </div>

      <div class="traveler-detail">
        <div v-if="detailLoading" class="empty-state">
          讀取旅客資料中…
        </div>

        <template v-else-if="selected">
          <div class="detail-heading">
            <div>
              <p class="label">Traveler</p>
              <h3>
                {{ displayName(selected.traveler) }}
              </h3>
              <p v-if="selected.traveler.nameEn">
                {{ selected.traveler.nameEn }}
              </p>
            </div>

            <span class="version-badge">
              {{ selected.documents.length }} 個證件版本
            </span>
          </div>

          <dl class="profile-grid">
            <div>
              <dt>出生日期</dt>
              <dd>{{ selected.traveler.birthDate }}</dd>
            </div>
            <div>
              <dt>性別</dt>
              <dd>
                {{ selected.traveler.gender || '未指定' }}
              </dd>
            </div>
            <div>
              <dt>國籍</dt>
              <dd>
                {{ selected.traveler.nationality || '未建立' }}
              </dd>
            </div>
          </dl>

          <div class="documents-heading">
            <strong>證件版本</strong>
          </div>

          <article
            v-for="document in selected.documents"
            :key="document.documentVersionId"
            class="document-card"
          >
            <div class="document-card-heading">
              <div>
                <strong>
                  {{ documentTypeLabel(document.documentType) }}
                </strong>
                <span
                  v-if="document.isCurrent"
                  class="current-badge"
                >
                  目前使用
                </span>
              </div>

              <span>
                {{ document.expiryDate ?? '無到期日' }}
              </span>
            </div>

            <dl>
              <div>
                <dt>證件號碼</dt>
                <dd>{{ document.documentNumber }}</dd>
              </div>
              <div v-if="document.nameZhOnDocument">
                <dt>證件中文姓名</dt>
                <dd>{{ document.nameZhOnDocument }}</dd>
              </div>
              <div v-if="document.nameEnOnDocument">
                <dt>證件英文姓名</dt>
                <dd>{{ document.nameEnOnDocument }}</dd>
              </div>
              <div>
                <dt>覆核時間</dt>
                <dd>
                  {{
                    new Date(
                      document.verifiedAt,
                    ).toLocaleString('zh-TW')
                  }}
                </dd>
              </div>
            </dl>
          </article>
        </template>

        <div v-else class="empty-state detail-empty">
          從左側選擇一位旅客查看證件版本。
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.traveler-workspace {
  margin-top: 22px;
}

.workspace-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.workspace-heading h2 {
  margin: 4px 0 0;
  font-size: 1.55rem;
  color: #172033;
}

.workspace-heading p:not(.eyebrow) {
  margin: 8px 0 0;
  max-width: 680px;
  color: #667085;
  line-height: 1.65;
}

.eyebrow,
.label {
  margin: 0;
  color: #667085;
  font-size: 0.76rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

button {
  border: 0;
  border-radius: 10px;
  padding: 10px 15px;
  background: #172033;
  color: #fff;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.persistent-notice {
  display: flex;
  gap: 10px;
  margin-top: 18px;
  border: 1px solid #b7e4c7;
  border-radius: 12px;
  padding: 12px 14px;
  background: #f0fdf4;
  color: #166534;
  line-height: 1.5;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.stats-grid article {
  border: 1px solid #dfe3ea;
  border-radius: 14px;
  padding: 15px 16px;
  background: #fff;
}

.stats-grid span,
.stats-grid strong {
  display: block;
}

.stats-grid span {
  color: #667085;
  font-size: 0.78rem;
}

.stats-grid strong {
  margin-top: 5px;
  color: #172033;
  font-size: 1.2rem;
}

.search-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  margin-top: 18px;
}

.search-row input {
  min-height: 44px;
  border: 1px solid #cfd5df;
  border-radius: 10px;
  padding: 10px 12px;
  background: #fff;
  font: inherit;
}

.workspace-error {
  margin: 12px 0 0;
  color: #b42318;
}

.crm-layout {
  display: grid;
  grid-template-columns:
    minmax(300px, 0.85fr)
    minmax(420px, 1.15fr);
  gap: 16px;
  margin-top: 16px;
}

.traveler-list,
.traveler-detail {
  min-height: 520px;
  border: 1px solid #dfe3ea;
  border-radius: 16px;
  background: #fff;
  overflow: hidden;
}

.list-heading {
  display: flex;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #e7eaf0;
  color: #475467;
}

.traveler-row {
  display: flex;
  width: 100%;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  border-radius: 0;
  border-bottom: 1px solid #eef0f4;
  padding: 14px 16px;
  background: #fff;
  color: #172033;
  text-align: left;
}

.traveler-row:hover,
.traveler-row.active {
  background: #f4f7fb;
}

.traveler-row > div:first-child {
  min-width: 0;
}

.traveler-row strong,
.traveler-row span {
  display: block;
}

.traveler-row span {
  margin-top: 3px;
  color: #667085;
  font-size: 0.82rem;
}

.row-meta {
  text-align: right;
  white-space: nowrap;
}

.row-meta small {
  display: block;
  margin-top: 4px;
  color: #667085;
}

.traveler-detail {
  padding: 18px;
}

.detail-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.detail-heading h3 {
  margin: 4px 0 0;
  color: #172033;
  font-size: 1.35rem;
}

.detail-heading p:not(.label) {
  margin: 4px 0 0;
  color: #667085;
}

.version-badge,
.current-badge {
  border-radius: 999px;
  padding: 5px 9px;
  font-size: 0.76rem;
  font-weight: 700;
  white-space: nowrap;
}

.version-badge {
  background: #eef4ff;
  color: #3538cd;
}

.current-badge {
  margin-left: 7px;
  background: #ecfdf3;
  color: #087443;
}

.profile-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin: 18px 0 0;
}

.profile-grid > div {
  border: 1px solid #e2e6ec;
  border-radius: 12px;
  padding: 11px 12px;
}

dt {
  color: #667085;
  font-size: 0.75rem;
}

dd {
  margin: 4px 0 0;
  color: #172033;
  font-weight: 700;
}

.documents-heading {
  margin-top: 22px;
  border-top: 1px solid #e3e6eb;
  padding-top: 18px;
  color: #344054;
}

.document-card {
  margin-top: 10px;
  border: 1px solid #dfe3ea;
  border-radius: 13px;
  padding: 14px;
}

.document-card-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.document-card-heading > div {
  display: flex;
  align-items: center;
}

.document-card-heading > span {
  color: #667085;
  font-size: 0.82rem;
}

.document-card dl {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px 18px;
  margin: 14px 0 0;
}

.empty-state {
  padding: 28px 18px;
  color: #667085;
  text-align: center;
}

.detail-empty {
  display: grid;
  min-height: 460px;
  place-items: center;
}

@media (max-width: 820px) {
  .workspace-heading,
  .persistent-notice {
    flex-direction: column;
  }

  .stats-grid,
  .crm-layout,
  .profile-grid {
    grid-template-columns: 1fr;
  }

  .traveler-detail {
    min-height: auto;
  }
}
</style>
