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

OCR runtime 與資料庫目前仍等待 PoC / schema 階段確認。

## 需求

- .NET 10 SDK
- Node.js 20.19+ 或 22.12+（建議直接使用目前受支援的新版 Node.js）
- npm

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

## 下一階段

骨架確認能正常啟動後，再進入：

1. 證件圖片上傳／預覽元件。
2. 瀏覽器端 OCR engine PoC。
3. 先用少量測試證件比較準確率、載入時間與模型大小。
4. 決定 OCR engine 後，再建立正式欄位解析與人工覆核流程。
5. 最後才接資料庫與 Google Sheets。


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
