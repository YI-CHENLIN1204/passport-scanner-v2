<script setup lang="ts">
const props = defineProps<{
  active: 'tours' | 'scan' | 'travelers' | 'quality'
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
  },
  {
    key: 'scan' as const,
    label: '證件掃描',
    hint: '批次上傳與辨識',
    path: '/scan',
  },
  {
    key: 'travelers' as const,
    label: '旅客資料',
    hint: '旅客與證件主檔',
    path: '/travelers',
  },
  {
    key: 'quality' as const,
    label: 'OCR 品質',
    hint: '準確率與訓練資料',
    path: '/ocr-quality',
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
      <span class="brand-mark">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 3.5h10A2.5 2.5 0 0 1 19.5 6v12A2.5 2.5 0 0 1 17 20.5H7A2.5 2.5 0 0 1 4.5 18V6A2.5 2.5 0 0 1 7 3.5Z" />
          <path d="M8 8.25h8M8 12h5M8 15.75h7" />
        </svg>
      </span>
      <span class="brand-copy">
        <strong>證件掃描系統</strong>
        <small>Passport Scanner V2</small>
      </span>
    </button>

    <p class="nav-section-label">主要功能</p>

    <nav class="sidebar-nav" aria-label="主要功能">
      <button
        v-for="item in items"
        :key="item.key"
        type="button"
        class="nav-item"
        :class="{ active: props.active === item.key }"
        @click="emit('navigate', item.path)"
      >
        <span class="active-rail" aria-hidden="true"></span>

        <span class="nav-icon" aria-hidden="true">
          <svg
            v-if="item.key === 'tours'"
            viewBox="0 0 24 24"
          >
            <path d="M4 5.5h6v6H4zM14 5.5h6v6h-6zM4 15.5h6v3H4zM14 15.5h6v3h-6z" />
          </svg>

          <svg
            v-else-if="item.key === 'scan'"
            viewBox="0 0 24 24"
          >
            <path d="M8 4H5a1 1 0 0 0-1 1v3M16 4h3a1 1 0 0 1 1 1v3M8 20H5a1 1 0 0 1-1-1v-3M16 20h3a1 1 0 0 0 1-1v-3M7 12h10" />
          </svg>

          <svg
            v-else-if="item.key === 'travelers'"
            viewBox="0 0 24 24"
          >
            <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20c.5-4 3-6 7-6s6.5 2 7 6" />
          </svg>

          <svg
            v-else
            viewBox="0 0 24 24"
          >
            <path d="M4 19V9M10 19V5M16 19v-7M22 19V3" />
            <path d="M2 19h22" />
          </svg>
        </span>

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
  width: 244px;
  display: flex;
  flex-direction: column;
  padding: 18px 12px;
  border-right: 1px solid #1d293b;
  background:
    linear-gradient(180deg, #101827 0%, #0d1421 100%);
  color: #fff;
  z-index: 30;
}

.brand {
  width: 100%;
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 10px 9px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.brand:hover {
  background: rgb(255 255 255 / 4%);
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 39px;
  height: 39px;
  flex: 0 0 auto;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 11px;
  background: #fff;
  color: #101827;
}

.brand-mark svg {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}

.brand-copy,
.system-status > span:last-child {
  display: grid;
  gap: 2px;
}

.brand strong {
  font-size: 14px;
  letter-spacing: .01em;
}

.brand small,
.system-status small {
  color: #8896aa;
  font-size: 10px;
}

.nav-section-label {
  margin: 26px 12px 8px;
  color: #627087;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .12em;
}

.sidebar-nav {
  display: grid;
  gap: 5px;
}

.nav-item {
  position: relative;
  width: 100%;
  display: flex;
  gap: 11px;
  align-items: center;
  min-height: 58px;
  padding: 9px 11px;
  overflow: hidden;
  border: 1px solid transparent;
  border-radius: 11px;
  background: transparent;
  color: #b9c4d5;
  text-align: left;
  cursor: pointer;
}

.nav-item:hover {
  border-color: rgb(255 255 255 / 5%);
  background: #182235;
}

.nav-item.active {
  border-color: #2a3850;
  background: #1a2639;
  color: #fff;
}

.active-rail {
  position: absolute;
  inset: 11px auto 11px 0;
  width: 3px;
  border-radius: 0 999px 999px 0;
  background: transparent;
}

.nav-item.active .active-rail {
  background: #fff;
}

.nav-icon {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 8px;
  background: rgb(255 255 255 / 4%);
}

.nav-item.active .nav-icon {
  background: rgb(255 255 255 / 9%);
}

.nav-icon svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}

.nav-copy {
  display: grid;
  gap: 2px;
}

.nav-copy strong {
  font-size: 13px;
}

.nav-copy small {
  color: #7f8da2;
  font-size: 10px;
}

.nav-item.active .nav-copy small {
  color: #9ba8ba;
}

.sidebar-footer {
  margin-top: auto;
  padding: 12px 10px 4px;
}

.system-status {
  display: flex;
  gap: 9px;
  align-items: center;
  padding-top: 14px;
  border-top: 1px solid #202c3f;
}

.system-status strong {
  font-size: 11px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #708096;
  box-shadow: 0 0 0 4px rgb(112 128 150 / 10%);
}

.status-dot.online {
  background: #35b56f;
  box-shadow: 0 0 0 4px rgb(53 181 111 / 11%);
}

.status-dot.offline {
  background: #e15c55;
  box-shadow: 0 0 0 4px rgb(225 92 85 / 11%);
}

@media (max-width: 820px) {
  .app-sidebar {
    position: static;
    width: auto;
    min-height: auto;
    padding: 11px;
    border-right: 0;
    border-bottom: 1px solid #1d293b;
  }

  .brand {
    padding: 7px 8px;
  }

  .nav-section-label {
    display: none;
  }

  .sidebar-nav {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    margin-top: 10px;
  }

  .nav-item {
    min-height: 50px;
    justify-content: center;
    padding: 8px;
  }

  .active-rail {
    inset: auto 18px 0;
    width: auto;
    height: 3px;
    border-radius: 999px 999px 0 0;
  }

  .nav-copy small,
  .sidebar-footer {
    display: none;
  }
}
</style>
