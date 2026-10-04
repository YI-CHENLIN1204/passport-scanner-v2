<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  searchTravelers,
  type TravelerSummaryResponse,
} from '../services/api'

const travelers = ref<TravelerSummaryResponse[]>([])
const search = ref('')
const loading = ref(true)
const error = ref('')

function documentLabel(type: string) {
  if (type === 'PASSPORT') return '護照'
  if (type === 'TAIWAN_COMPATRIOT_PERMIT') return '台胞證'
  if (type === 'TAIWAN_NATIONAL_ID') return '身分證'
  return type
}

async function load() {
  loading.value = true
  error.value = ''

  try {
    travelers.value = await searchTravelers(search.value, 100)
  } catch (err) {
    error.value =
      err instanceof Error
        ? err.message
        : '旅客資料載入失敗。'
  } finally {
    loading.value = false
  }
}

onMounted(load)
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

    <div class="toolbar">
      <div class="search-box">
        <span>⌕</span>
        <input
          v-model="search"
          type="search"
          placeholder="搜尋姓名或證件資料"
          @keyup.enter="load"
        />
      </div>
      <button
        type="button"
        :disabled="loading"
        @click="load"
      >
        搜尋
      </button>
    </div>

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
          </tr>
        </tbody>
      </table>
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

.toolbar {
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

.toolbar > button {
  min-height: 44px;
  padding: 0 16px;
  border: 0;
  border-radius: 10px;
  background: #172033;
  color: #fff;
  font-weight: 700;
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

@media (max-width: 720px) {
  .toolbar {
    flex-direction: column;
  }

  .table-card {
    overflow-x: auto;
  }

  table {
    min-width: 720px;
  }
}
</style>
