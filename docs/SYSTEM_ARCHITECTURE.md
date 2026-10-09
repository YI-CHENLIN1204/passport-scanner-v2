# System Architecture

## 核心原則

V2 採「瀏覽器端 OCR + 後端資料管理」的方向。

```text
證件照片
   │
   ▼
使用者瀏覽器
   ├─ 圖像前處理
   ├─ OCR 推論
   ├─ 欄位解析 / 驗證
   └─ 人工覆核介面
          │
          │ 結構化結果 JSON
          ▼
       Backend API
          │
          ├─ 團別 / 旅客資料
          ├─ travelers
          ├─ document_versions
          ├─ scan_batches / scan_items
          ├─ training_samples / benchmark
          └─ CSV 匯出
```

## OCR 與照片保存必須分開理解

「瀏覽器端 OCR」代表 OCR 推論本身不能依賴把原圖送到外部雲端 OCR API。

若 V2 為了人工覆核而需要保存原始證件照片，可以有獨立的受控儲存流程；這不代表 OCR 改成伺服器端。照片保存必須受到保存期限與刪除政策控制。

## 前端責任

- 上傳／預覽證件影像。
- 圖像前處理。
- 執行 OCR。
- 解析 OCR 結果。
- 顯示欄位與信心／異常提示。
- 人工修正與確認。
- 執行台灣身分證格式與檢查碼等可在前端完成的即時驗證。

## 後端責任

- 團別與旅客資料管理。
- 旅客主檔管理。
- 證件版本管理。
- 接收已結構化的 OCR / 人工修正結果。
- 資料一致性檢查。
- 管理受控的 production 證件照片保存與到期清除。
- 管理 Training Dataset 與固定 benchmark metadata。
- 人工觸發 CSV 匯出。

## 部署方向

V2 不要求 OCR server 常駐；網站可部署於一般 Web hosting / Render 類環境，但 OCR 計算仍在使用者瀏覽器。

目前實作已固定為 Vue 3 + TypeScript + Vite、ASP.NET Core Web API (.NET 10)、PostgreSQL 16，以及瀏覽器端 PaddleOCR / MRZ / parser pipeline。OCR recognition / parser 目前以固定 Test benchmark 為基準暫時凍結；後續實作仍不可因方便而改變「瀏覽器端 OCR」這個核心架構。

## 安全原則

- API key / credentials 不進 Git。
- 正式環境秘密使用環境變數或 secrets。
- 盡量避免不必要地傳輸或複製證件影像。
- 前後端 log 不可寫入完整身分證號、護照號碼或原始證件影像內容。
