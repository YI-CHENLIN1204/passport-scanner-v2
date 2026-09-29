# Passport Scanner V2

旅行社內部使用的證件掃描與旅客資料整理系統。

V2 的核心方向是：**在使用者瀏覽器端執行 OCR，降低雲端 AI 成本與敏感證件影像外送風險；只擷取真正有業務價值的欄位，並保留人工覆核流程。**

## V2 目前範圍

- 使用對象：旅行社內部人員（業務／控團）。
- 支援證件方向：護照、台灣身分證、台胞證。
- OCR：在瀏覽器端執行，不把證件影像送到雲端 OCR 服務做辨識。
- 辨識結果：以結構化資料回傳後端。
- 原始證件照片：可因人工覆核需求另行保存，但其保存流程與 OCR 推論分開管理。
- 審核：人工逐筆確認 OCR 結果。
- 匯出：人工按鈕觸發 Google Sheets 匯出，不做即時同步。
- V2 不做登入與複雜權限管理。
- V2 不直接整合 ERP。

## 文件

- [AGENTS.md](./AGENTS.md) — 給 Codex / AI Agent 的專案工作規則。
- [docs/PROJECT_CONTEXT.md](./docs/PROJECT_CONTEXT.md) — 專案背景、使用情境與邊界。
- [docs/SYSTEM_ARCHITECTURE.md](./docs/SYSTEM_ARCHITECTURE.md) — V2 架構與資料流。
- [docs/OCR_REQUIREMENTS.md](./docs/OCR_REQUIREMENTS.md) — OCR 文件類型、欄位與驗證原則。\n- [docs/OCR_POC.md](./docs/OCR_POC.md) — 瀏覽器 OCR PoC 與引擎比較基準。
- [docs/DATA_MODEL.md](./docs/DATA_MODEL.md) — 旅客主檔、證件版本與團別資料模型方向。
- [docs/DECISIONS.md](./docs/DECISIONS.md) — 已確認決策與尚未定案項目。\n- [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) — 本機環境、啟動方式與前後端 port。

## 開發原則

1. 先完成 V2 MVP，再處理 V3 / V4。
2. 不為了「資料看起來完整」而儲存沒有業務價值的證件欄位。
3. OCR 必須允許人工覆核，不能把辨識結果直接視為正確資料。
4. 敏感資料採最小化蒐集與最小化保存。
5. 尚未寫進「已確認決策」的構想，不可自行當成正式需求實作。


## Current Development Stack

```text
frontend/  Vue 3 + TypeScript + Vite        :5173
backend/   ASP.NET Core Web API (.NET 10)  :5080
```

開發啟動方式請看 [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md)。
