# Development

## 技術棧

### Frontend
- Vue 3
- TypeScript
- Vite
- 開發 port：5173

### Backend
- ASP.NET Core Web API
- .NET 10 LTS
- 開發 port：5080

目前正式架構已確定：

- OCR：瀏覽器端 PaddleOCR / MRZ / parser pipeline。
- 資料庫：PostgreSQL。
- 執行方式：開發可分別啟動 frontend/backend；日常整合測試建議直接使用 Docker Compose。
- 正式匯出：CSV，不做 Google Sheets 即時同步。
- OCR recognition / parser 目前以固定 Test benchmark 為基準暫時凍結，優先完成 V2 系統本體。

## 需求

日常使用／整合測試建議：

- Docker Desktop
- Git

若要分別直接開發 frontend / backend：

- .NET 10 SDK
- Node.js 20.19+ 或 22.12+
- npm

## 日常啟動方式（建議）

在 repository 根目錄：

```powershell
git pull origin main
docker compose up -d --build
```

查看容器：

```powershell
docker compose ps
```

停止：

```powershell
docker compose down
```

一般程式碼更新後重新執行：

```powershell
docker compose up -d --build
```

即可 rebuild image 並 recreate 需要更新的 container。

> 不要隨便執行 `docker compose down -v`。  
> `-v` 會刪除 PostgreSQL named volume；若沒有備份，正式旅客與 OCR Dataset 資料會一起消失。

## PostgreSQL 備份與換電腦還原

V2 的正式資料存在本機 Docker named volume，不會隨 Git repository 移動。

換電腦、重設 Docker Desktop、清理 Docker volume 前，先備份：

```powershell
.\scripts\backup-db.ps1
```

預設輸出：

```text
backups/
├─ passport_scanner-YYYYMMDD-HHMMSS.dump
└─ passport_scanner-YYYYMMDD-HHMMSS.dump.sha256.txt
```

備份包含完整 PostgreSQL 資料庫，包括：

- Traveler / DocumentVersion
- tours / tour members / per-tour document links
- scan batches / scan items
- 尚未依期限刪除的 production 圖片
- Training Dataset
- OCR benchmark / fixed Test metadata

`backups/` 與 `*.dump` 已由 `.gitignore` 排除，**不要提交 GitHub**。

在另一台電腦先 clone / pull repository，啟動 Docker Desktop，然後：

```powershell
.\scripts\restore-db.ps1 -BackupFile ".\backups\passport_scanner-YYYYMMDD-HHMMSS.dump"
```

restore 會在破壞現有資料庫前先：

1. 驗證 SHA256（若 sidecar 存在）。
2. 使用 `pg_restore --list` 確認 archive 可讀。
3. 通過後才停止 application services 並替換資料庫。

## 啟動後端

在 repository 根目錄：

```bash
cd backend/PassportScanner.Api
dotnet restore
dotnet run
```

成功後：

```text
http://localhost:5080/api/health
```

應回傳類似：

```json
{
  "status": "ok",
  "service": "passport-scanner-api",
  "timestamp": "..."
}
```

## 啟動前端

另開一個終端機：

```bash
cd frontend
npm install
npm run dev
```

瀏覽器開啟：

```text
http://localhost:5173
```

畫面應顯示：

```text
API 已連線 · passport-scanner-api
```

開發模式下，Vite 會把瀏覽器對 `/api/*` 的 request proxy 到 `http://localhost:5080`。

因此：

```text
Browser
  │
  │ http://localhost:5173
  ▼
Vue / Vite
  │
  │ /api/health
  │ proxy
  ▼
ASP.NET Core API
http://localhost:5080
```

這正是本專案採用的「前後端完全分離」：兩個服務、兩個 port，透過 HTTP / JSON 溝通。

## Production API URL

如果未來前端與 API 部署在不同網址，可以建立本機 `.env`：

```dotenv
VITE_API_BASE_URL=https://your-api.example.com
```

不要提交 `.env`。

Repository 只保留：

```text
frontend/.env.example
```

## 目前 V2 開發範圍

目前 V2 是旅行社**內部證件掃描／旅客資料建立系統**，不是 ERP、CRM，也不是旅客自助端。

正式流程：

```text
建立團別
→ 設定本團需要的證件
→ 批次上傳
→ 瀏覽器端 OCR
→ 自動人物歸組／必要時人工合併
→ 人工審核
→ Traveler / DocumentVersion / TourMemberDocument
→ CSV 匯出
```

目前主要功能已包含：

- 團別建立、編輯、篩選與收件進度。
- 護照／台胞證／台灣身分證資料結構。
- 批次掃描與失敗項目單獨重跑。
- 人工審核與已審核再編輯。
- Traveler 自動／人工合併。
- per-tour document link。
- production 照片 retention。
- OCR Training Dataset 與固定 Train / Validation / Test split。
- Current Test Benchmark / history。
- CSV 欄位選擇與排序。
- PostgreSQL portable backup / restore。

V3 才考慮旅客自行拍攝／上傳證件；ERP / CRM 整合也不屬於目前 V2 範圍。

## PaddleOCR 模型 CORS

開發環境不要讓瀏覽器直接向 Paddle 官方模型 CDN 抓取模型。部分 CDN 回應可能帶有與目前 localhost port 不一致的 `Access-Control-Allow-Origin`，例如先前在 5174 載入後，切回 5173 可能收到只允許 5174 的快取回應。

本專案在 Vite development server 提供：

```text
/paddle-models/*
```

並 proxy 到 Paddle 官方模型 CDN。瀏覽器因此只對目前的 Vite origin 發 request，不受第三方 CDN CORS 限制。

正式部署不能依賴 Vite dev proxy。Production 必須另外決定：

- 將 Paddle model assets 自行部署為同源靜態檔案，或
- 建立受控的 model asset proxy / cache。

OCR 推論本身仍維持在瀏覽器端；model asset proxy 不代表把證件圖片送到伺服器 OCR。


### PaddleOCR.js model archive format

PaddleOCR.js browser runtime does not accept the ordinary Paddle inference tar as a drop-in browser model. The browser SDK expects an uncompressed tar that contains `inference.onnx` and `inference.yml`.

For PP-OCRv5 mobile models, use the browser/ONNX assets used by PaddleOCR.js itself:

- `PP-OCRv5_mobile_det_onnx_infer.tar`
- `PP-OCRv5_mobile_rec_onnx_infer.tar`

Using `*_infer.tar` without `_onnx_` can download successfully through the proxy but then fail during SDK initialization with `Entry "inference.onnx" was not found in the tar archive.`.
