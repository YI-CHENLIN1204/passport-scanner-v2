<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppSidebar from './components/layout/AppSidebar.vue'
import ToursPage from './views/ToursPage.vue'
import TourDetailPage from './views/TourDetailPage.vue'
import BatchScanPage from './views/BatchScanPage.vue'
import TravelersPage from './views/TravelersPage.vue'
import OcrQualityPage from './views/OcrQualityPage.vue'
import { getHealth } from './services/api'

type Section = 'tours' | 'scan' | 'travelers' | 'quality'

interface AppRoute {
  section: Section
  view:
    | 'tours'
    | 'tour-detail'
    | 'scan'
    | 'travelers'
    | 'quality'
  tourId?: string
}

const currentPath = ref(window.location.pathname)
const health = ref<'checking' | 'online' | 'offline'>('checking')
const scanRunning = ref(false)

function parseRoute(path: string): AppRoute {
  const scanMatch = path.match(
    /^\/tours\/([^/]+)\/scan\/?$/,
  )

  if (scanMatch) {
    return {
      section: 'scan',
      view: 'scan',
      tourId: decodeURIComponent(scanMatch[1]),
    }
  }

  const tourMatch = path.match(
    /^\/tours\/([^/]+)\/?$/,
  )

  if (tourMatch) {
    return {
      section: 'tours',
      view: 'tour-detail',
      tourId: decodeURIComponent(tourMatch[1]),
    }
  }

  if (/^\/scan\/?$/.test(path)) {
    return {
      section: 'scan',
      view: 'scan',
    }
  }

  if (/^\/travelers\/?$/.test(path)) {
    return {
      section: 'travelers',
      view: 'travelers',
    }
  }

  if (/^\/ocr-quality\/?$/.test(path)) {
    return {
      section: 'quality',
      view: 'quality',
    }
  }

  return {
    section: 'tours',
    view: 'tours',
  }
}

const route = computed(() =>
  parseRoute(currentPath.value),
)

function navigate(path: string) {
  if (
    scanRunning.value &&
    route.value.view === 'scan' &&
    path !== currentPath.value
  ) {
    window.alert(
      '批次 OCR 正在進行中，請等待這批處理完成後再離開掃描頁。',
    )
    return
  }

  if (window.location.pathname !== path) {
    window.history.pushState({}, '', path)
  }

  currentPath.value = path
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function handlePopState() {
  if (
    scanRunning.value &&
    route.value.view === 'scan'
  ) {
    window.history.pushState(
      {},
      '',
      currentPath.value,
    )
    window.alert(
      '批次 OCR 正在進行中，請等待這批處理完成後再離開掃描頁。',
    )
    return
  }

  currentPath.value = window.location.pathname
}

async function checkHealth() {
  health.value = 'checking'

  try {
    await getHealth()
    health.value = 'online'
  } catch {
    health.value = 'offline'
  }
}

onMounted(() => {
  if (window.location.pathname === '/') {
    window.history.replaceState({}, '', '/tours')
    currentPath.value = '/tours'
  }

  window.addEventListener('popstate', handlePopState)
  void checkHealth()
})

onBeforeUnmount(() => {
  window.removeEventListener('popstate', handlePopState)
})
</script>

<template>
  <div class="app-shell">
    <AppSidebar
      :active="route.section"
      :health="health"
      @navigate="navigate"
    />

    <main class="app-content">
      <div
        v-if="health === 'offline'"
        class="connection-banner"
      >
        <span>API 目前無法連線，部分功能暫時不可用。</span>
        <button type="button" @click="checkHealth">
          重新檢查
        </button>
      </div>

      <ToursPage
        v-if="route.view === 'tours'"
        @navigate="navigate"
      />

      <TourDetailPage
        v-else-if="
          route.view === 'tour-detail' &&
          route.tourId
        "
        :key="route.tourId"
        :tour-id="route.tourId"
        @navigate="navigate"
      />

      <BatchScanPage
        v-else-if="route.view === 'scan'"
        :key="route.tourId ?? 'scan-home'"
        :tour-id="route.tourId ?? null"
        @navigate="navigate"
        @running-change="scanRunning = $event"
      />

      <TravelersPage
        v-else-if="route.view === 'travelers'"
      />

      <OcrQualityPage
        v-else-if="route.view === 'quality'"
      />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
}

.app-content {
  width: calc(100% - 244px);
  min-height: 100vh;
  margin-left: 244px;
  padding: 34px clamp(24px, 4vw, 54px) 56px;
}

.app-content > :deep(.page) {
  width: min(100%, 1440px);
  margin-inline: auto;
}

.connection-banner {
  display: flex;
  gap: 18px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  padding: 11px 14px;
  border: 1px solid #f1c5c1;
  border-radius: 11px;
  background: #fff1ef;
  color: #9c382f;
  font-size: 13px;
}

.connection-banner button {
  min-height: 34px;
  padding: 0 11px;
  border: 1px solid #e2aaa5;
  border-radius: 8px;
  background: #fff;
  color: #8e332b;
  font: inherit;
  font-weight: 700;
}

@media (max-width: 820px) {
  .app-content {
    width: 100%;
    margin-left: 0;
    padding: 24px 16px 40px;
  }
}
</style>
