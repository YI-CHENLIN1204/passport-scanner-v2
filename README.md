# Passport Scanner V2

> **交接與最新開發狀態：** 請優先閱讀 [docs/HANDOFF.md](./docs/HANDOFF.md)（目前主線 OCR `2026.10.11.14` 待驗證；最新照片實測 `.13` 仍無改善，`.10/.11/.12/.13` 台胞證皆低於 `.6`，`.6` 仍是較佳比較基準）、[docs/WORKLOG.md](./docs/WORKLOG.md) 與 [docs/OCR_OPEN_SOURCE_REVIEW.md](./docs/OCR_OPEN_SOURCE_REVIEW.md)。本 README 其餘功能描述是概覽，不代表最新 OCR 實測數據。

旅行社內部使用的證件掃描與旅客資料整理系統。

V2 的核心方向是：**在使用者瀏覽器端執行 OCR，降低雲端 AI 成本與敏感證件影像外送風險；只擷取真正有業務價值的欄位，並保留人工覆核流程。**

## V2 目前範圍

- 使用對象：旅行社內部人員（業務／控團）。
- 支援證件方向：護照、台灣身分證、台胞證。
- OCR：在瀏覽器端執行，不把證件影像送到雲端 OCR 服務做辨識。
- 辨識結果：以結構化資料回傳後端。
- 原始證件照片：可因人工覆核需求另行保存，但其保存流程與 OCR 推論分開管理。
- 審核：人工逐筆確認 OCR 結果。
- 匯出：由團別頁人工觸發 CSV 匯出，可依證件類型選擇欄位與排序。
- V2 不做登入與複雜權限管理。
- V2 不直接整合 ERP。

## 目前護照流程

護照已完成第一輪 OCR 引擎選型與 5 張不同條件的泛化測試：

- 正式主引擎：PaddleOCR.js / PP-OCRv5。
- OCR 執行於瀏覽器端。
- 弱偵測時自動改試護照底部 MRZ 區域。
- TD3 MRZ 解析後以 check digit 驗證護照號碼、出生日期、有效期限與 composite。
- 辨識完成後直接進入可編輯的人工覆核卡。
- 人工覆核日期顯示為 YYYY-MM-DD。
- 按下確認後會建立 typed review payload，送到 ASP.NET Core 後端再次驗證，再寫入 PostgreSQL。
- Docker Compose 會啟動獨立 PostgreSQL service，旅客主檔與證件版本保存在 named volume；重啟 frontend／backend 不會清空資料。
- Tesseract Baseline A 與泛化測試工具保留在開發診斷區，不進旅行社員工主要流程。

## 文件

- [AGENTS.md](./AGENTS.md) — 給 Codex / AI Agent 的專案工作規則。
- [docs/PROJECT_CONTEXT.md](./docs/PROJECT_CONTEXT.md) — 專案背景、使用情境與邊界。
- [docs/SYSTEM_ARCHITECTURE.md](./docs/SYSTEM_ARCHITECTURE.md) — V2 架構與資料流。
- [docs/OCR_REQUIREMENTS.md](./docs/OCR_REQUIREMENTS.md) — OCR 文件類型、欄位與驗證原則。
- [docs/OCR_POC.md](./docs/OCR_POC.md) — 瀏覽器 OCR PoC 與引擎比較基準。
- [docs/DATA_MODEL.md](./docs/DATA_MODEL.md) — 旅客主檔、證件版本與團別資料模型方向。
- [docs/DECISIONS.md](./docs/DECISIONS.md) — 已確認決策與尚未定案項目。
- [docs/PASSPORT_REVIEW_CONTRACT.md](./docs/PASSPORT_REVIEW_CONTRACT.md) — 人工覆核完成後的前端 draft / 未來 API payload。
- [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) — 本機環境、啟動方式與前後端 port。

## 開發原則

1. 先完成 V2 內部掃描／審核／旅客資料／CSV 匯出，再處理 V3 / V4。
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


## 目前資料流里程碑

```text
護照圖片
  ↓
PaddleOCR / PP-OCRv5（瀏覽器）
  ↓
MRZ + check digit
  ↓
人工覆核
  ↓
PassportReviewDraft
  ↓
ASP.NET Core 後端驗證
  ↓
ITravelerStore
  ↓
PostgresTravelerStore
  ├─ travelers
  └─ document_versions
```

目前版本已能驗證：

- 第一次掃描：建立旅客 + 第一個護照版本。
- 同一本護照再次掃描：更新既有版本，不重複新增。
- 同一旅客換新護照：建立新 document version，舊版本保留。
- 舊護照重新掃描：不會自動變回 current。
- 多位完全相同候選：後端拒絕自動合併。

正式 PostgreSQL 已接入；OCR / 覆核 contract 維持不變。


## 目前台胞證流程

台胞證與台灣身分證都已進入正式 OCR / 人工覆核流程。

目前流程：

- PP-OCRv5 瀏覽器端整頁辨識。
- 擷取中文姓名、8 位台胞證號碼、出生日期、性別、有效期限。
- 8 位證號與 2 位簽發次數分開處理，不保存簽發次數。
- 日期統一轉為 YYYY-MM-DD。
- OCR 無法可靠取得的欄位留給人工補填。
- 儲存前需人工對照原圖確認所有欄位。
- 儲存後與護照共用 traveler_master / document_versions 版本邏輯。

## 旅客資料／正式主檔

主介面目前分為：

- 證件掃描。
- 旅客資料。

旅客資料頁已可：

- 搜尋中文姓名、英文姓名或證件號碼。
- 查看 traveler 主檔。
- 查看護照／台胞證／台灣身分證歷史版本。
- 查看目前使用中的證件版本。

目前 persistence 為 PostgreSQL；旅客主檔與證件版本保存在 Docker named volume，backend 重啟後資料仍保留。


## 目前台灣身分證流程

- PP-OCRv5 瀏覽器端整頁辨識。
- 自動判斷 0° / ±90° / 180°，必要時再做小角度校正。
- 擷取中文姓名、國民身分證統一編號、出生日期。
- 民國年出生日期自動轉為 YYYY-MM-DD。
- 性別由身分證字號第 2 碼交叉驗證，不在無可靠字號時預設。
- 前端與 ASP.NET Core 後端都獨立計算身分證字號檢查碼。
- OCR 抓不到的欄位允許人工補填；全部人工覆核後才可儲存。
- 身分證沒有到期日，因此 document_versions 的 expiry_date 對此證件為 NULL。


## PostgreSQL 持久化

目前正式資料層已從開發用記憶體儲存切換為 PostgreSQL。

Docker Compose 會建立三個服務：

- `frontend`：Vue + Nginx。
- `backend`：ASP.NET Core API。
- `database`：PostgreSQL 16。

資料主要分為：

- `travelers`：旅客主檔。
- `document_versions`：護照、台胞證、台灣身分證的歷史版本。

PostgreSQL 使用 named volume `passport_scanner_postgres`。一般的 `docker compose down` 不會刪除資料；只有明確執行 `docker compose down -v` 或手動刪除 volume 才會移除資料。

本機開發密碼可透過環境變數 `PASSPORT_DB_PASSWORD` 覆寫。Compose 內的預設密碼只供本機開發使用，不應直接用於正式公開環境。
