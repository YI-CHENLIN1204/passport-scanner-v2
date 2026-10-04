<script setup lang="ts">
const props = defineProps<{
  active: 'tours' | 'scan' | 'travelers'
  health: 'checking' | 'online' | 'offline'
}>()

const emit = defineEmits<{
  navigate: [path: string]
}>()

const items = [
  {
    key: 'tours' as const,
    label: '團別管理',
    hint: '團別與收件進度',
    path: '/tours',
    icon: '▦',
  },
  {
    key: 'scan' as const,
    label: '證件掃描',
    hint: '批次上傳與辨識',
    path: '/scan',
    icon: '⌁',
  },
  {
    key: 'travelers' as const,
    label: '旅客資料',
    hint: '旅客與證件主檔',
    path: '/travelers',
    icon: '♙',
  },
]
</script>

<template>
  <aside class="app-sidebar">
    <button
      type="button"
      class="brand"
      @click="emit('navigate', '/tours')"
    >
      <span class="brand-mark">PS</span>
      <span>
        <strong>證件掃描系統</strong>
        <small>Passport Scanner V2</small>
      </span>
    </button>

    <nav class="sidebar-nav" aria-label="主要功能">
      <button
        v-for="item in items"
        :key="item.key"
        type="button"
        class="nav-item"
        :class="{ active: props.active === item.key }"
        @click="emit('navigate', item.path)"
      >
        <span class="nav-icon">{{ item.icon }}</span>
        <span class="nav-copy">
          <strong>{{ item.label }}</strong>
          <small>{{ item.hint }}</small>
        </span>
      </button>
    </nav>

    <div class="sidebar-footer">
      <div class="system-status">
        <span
          class="status-dot"
          :class="props.health"
        ></span>
        <span>
          <strong>
            {{
              props.health === 'online'
                ? '系統正常'
                : props.health === 'offline'
                  ? 'API 未連線'
                  : '檢查系統中'
            }}
          </strong>
          <small>Internal · V2</small>
        </span>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.app-sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  width: 248px;
  display: flex;
  flex-direction: column;
  padding: 20px 14px;
  background: #101827;
  color: #fff;
  z-index: 30;
}

.brand {
  width: 100%;
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 10px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 11px;
  background: #fff;
  color: #101827;
  font-size: 12px;
  font-weight: 850;
  letter-spacing: .04em;
}

.brand > span:last-child,
.system-status > span:last-child {
  display: grid;
  gap: 2px;
}

.brand strong {
  font-size: 15px;
}

.brand small,
.system-status small {
  color: #95a2b7;
  font-size: 11px;
}

.sidebar-nav {
  display: grid;
  gap: 6px;
  margin-top: 28px;
}

.nav-item {
  width: 100%;
  display: flex;
  gap: 11px;
  align-items: center;
  min-height: 60px;
  padding: 10px 12px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: #c4cede;
  text-align: left;
}

.nav-item:hover {
  background: #182235;
}

.nav-item.active {
  background: #fff;
  color: #101827;
}

.nav-icon {
  width: 28px;
  font-size: 20px;
  text-align: center;
}

.nav-copy {
  display: grid;
  gap: 2px;
}

.nav-copy strong {
  font-size: 14px;
}

.nav-copy small {
  color: #8997ad;
  font-size: 11px;
}

.nav-item.active .nav-copy small {
  color: #6d788a;
}

.sidebar-footer {
  margin-top: auto;
  padding: 12px 10px 4px;
}

.system-status {
  display: flex;
  gap: 9px;
  align-items: center;
}

.system-status strong {
  font-size: 12px;
}

.status-dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: #708096;
}

.status-dot.online {
  background: #35b56f;
}

.status-dot.offline {
  background: #e15c55;
}

@media (max-width: 820px) {
  .app-sidebar {
    position: static;
    width: auto;
    min-height: auto;
    padding: 12px;
  }

  .sidebar-nav {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin-top: 12px;
  }

  .nav-item {
    justify-content: center;
  }

  .nav-copy small,
  .sidebar-footer {
    display: none;
  }
}
</style>
