<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { getHealth, type HealthResponse } from './services/api'

type DocumentType = 'passport' | 'tw-id' | 'taiwan-compatriot-permit'

const health = ref<HealthResponse | null>(null)
const error = ref('')
const loading = ref(true)

const documentType = ref<DocumentType>('passport')
const selectedFile = ref<File | null>(null)
const previewUrl = ref('')
const uploadError = ref('')

const fileSummary = computed(() => {
  if (!selectedFile.value) return ''

  const sizeMb = selectedFile.value.size / 1024 / 1024
  return `${selectedFile.value.name} · ${sizeMb.toFixed(2)} MB`
})

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

function clearPreview() {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
  }

  previewUrl.value = ''
  selectedFile.value = null
  uploadError.value = ''
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  clearPreview()

  if (!file) return

  if (!file.type.startsWith('image/')) {
    uploadError.value = '目前 PoC 只接受圖片檔。'
    input.value = ''
    return
  }

  const maxBytes = 15 * 1024 * 1024
  if (file.size > maxBytes) {
    uploadError.value = '圖片不可超過 15 MB。'
    input.value = ''
    return
  }

  selectedFile.value = file
  previewUrl.value = URL.createObjectURL(file)
}

onMounted(checkApi)
onBeforeUnmount(clearPreview)
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

    <section class="scanner-card">
      <div class="section-heading">
        <div>
          <p class="label">Step 2 · Browser input</p>
          <h2>選擇證件並在瀏覽器預覽</h2>
        </div>

        <span class="local-only-badge">本機處理</span>
      </div>

      <div class="form-grid">
        <label class="field">
          <span>證件類型</span>
          <select v-model="documentType">
            <option value="passport">護照</option>
            <option value="tw-id">台灣身分證</option>
            <option value="taiwan-compatriot-permit">台胞證</option>
          </select>
        </label>

        <label class="field">
          <span>證件圖片</span>
          <input
            type="file"
            accept="image/*"
            @change="handleFileChange"
          />
        </label>
      </div>

      <p class="privacy-note">
        目前這一步只使用瀏覽器的本機 File / Object URL 預覽圖片，
        不會把原始影像送到後端 API。
      </p>

      <p v-if="uploadError" class="inline-error">
        {{ uploadError }}
      </p>

      <div v-if="previewUrl" class="preview-layout">
        <div class="image-panel">
          <img
            :src="previewUrl"
            :alt="`${documentType} preview`"
          />
        </div>

        <div class="preview-info">
          <p class="label">已載入</p>
          <p class="file-name">{{ fileSummary }}</p>
          <p class="document-label">
            類型：
            <strong>
              {{
                documentType === 'passport'
                  ? '護照'
                  : documentType === 'tw-id'
                    ? '台灣身分證'
                    : '台胞證'
              }}
            </strong>
          </p>

          <button type="button" class="secondary-button" @click="clearPreview">
            移除圖片
          </button>
        </div>
      </div>

      <div v-else class="empty-preview">
        選擇一張證件圖片後，預覽會顯示在這裡。
      </div>
    </section>

    <section class="next-card">
      <h2>這一階段先不做 OCR</h2>
      <p>
        先確認三種證件都能正常在瀏覽器載入與預覽。下一步才把 OCR engine
        接到這張圖片上，這樣遇到問題時可以清楚分辨是圖片輸入問題還是 OCR 問題。
      </p>
    </section>
  </main>
</template>
