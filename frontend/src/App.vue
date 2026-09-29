<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { getHealth, type HealthResponse } from './services/api'

const health = ref<HealthResponse | null>(null)
const error = ref('')
const loading = ref(true)

async function checkApi() {
  loading.value = true
  error.value = ''

  try {
    health.value = await getHealth()
  } catch (err) {
    health.value = null
    error.value = err instanceof Error ? err.message : '無法連線到 API'
  } finally {
    loading.value = false
  }
}

onMounted(checkApi)
</script>

<template>
  <main class="page-shell">
    <section class="hero">
      <p class="eyebrow">Internal Tool · V2</p>
      <h1>Passport Scanner</h1>
      <p class="subtitle">
        瀏覽器端 OCR、人工覆核、旅客主檔與證件版本管理。
      </p>
    </section>

    <section class="status-card">
      <div>
        <p class="label">前後端連線狀態</p>

        <p v-if="loading" class="status">檢查中…</p>

        <p v-else-if="health" class="status success">
          API 已連線 · {{ health.service }}
        </p>

        <p v-else class="status error">
          API 未連線 · {{ error }}
        </p>
      </div>

      <button type="button" :disabled="loading" @click="checkApi">
        重新檢查
      </button>
    </section>

    <section class="next-card">
      <h2>目前骨架完成</h2>
      <p>
        下一階段才加入證件上傳、瀏覽器 OCR PoC 與人工覆核畫面，
        不會在這個階段把 OCR 套件或資料庫架構一次綁死。
      </p>
    </section>
  </main>
</template>
