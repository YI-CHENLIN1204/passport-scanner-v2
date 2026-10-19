# Passport Scanner V2 — 上線最低驗收

更新日期：2026-10-19

本文件定義 V2 可以投入旅行社內部使用前的最低驗收門檻。目標不是把固定 OCR Validation 強行做到 100%，而是確認「批次掃描 → 人工審核 → 正式資料 → 匯出 → 保存／備份」整條流程可靠。

## 1. 自動驗收入口

Windows 專案根目錄：

```powershell
cd C:\Users\User\Desktop\passport-scanner-v2
.\scripts\verify-v2-launch.ps1
```

此腳本預設使用：

- Docker project：`passport-scanner-v2-acceptance`
- Frontend：`http://localhost:15173`
- Backend：`http://localhost:15080`
- 獨立 PostgreSQL volume

因此不會使用正常開發環境的 `5173 / 5080`，也不會讀寫正常 `passport_scanner_postgres` volume。

驗收結束後會自動 `docker compose down -v` 刪除驗收專用資料；若要保留失敗現場，可加：

```powershell
.\scripts\verify-v2-launch.ps1 -KeepStack
```

## 2. 自動驗收涵蓋範圍

### A. D-130 / OCR 回歸與前端 Build

腳本先執行：

```powershell
cd frontend
npm.cmd run verify:v2
```

其中 `verify:v2` 包含：

- 原有 `verify:ocr`
- D-130 guard：不得恢復 `normalizePassportNameRoiLuminance` 或 `contrast-review`
- 保留 PP-OCRv6 `lower-page` 人工候選
- V2 CSV／人工審核／版本顯示／人工合併安全守衛
- Vue / TypeScript production build

這只能證明程式回歸與編譯通過，**不能宣稱 OCR 真實準確率提升**。

### B. Backend Build

執行 ASP.NET Core `dotnet build`，確保目前 backend 可編譯。

### C. Docker 與資料庫結構

在獨立 Docker project 中 build 並啟動 frontend / backend / PostgreSQL，驗證：

- backend health
- frontend reverse proxy health
- PostgreSQL persistence
- 核心 tables 存在
- `scan_items.saved_document_version_id` FK 存在
- 每位旅客每種證件最多一個 current version 的 unique index 存在
- 不得存在重複 current document groups

### D. 批次掃描生命週期與人工審核

使用完全合成的 1×1 PNG 與假資料：

1. 建立測試團
2. 建立護照與台胞證 batch
3. 寫入 scan item
4. 完成 batch，包含一個模擬 failed attempt
5. 人工 review 台胞證
6. 人工 review 護照
7. 驗證兩份證件合併到同一正式 Traveler
8. 驗證正式團員保留兩種 DocumentVersion
9. 驗證 review queue 清空
10. 驗證已審核 scan item 不能直接刪除

這一段不執行 OCR 模型，也不讀任何私人證件。

### E. Production photo retention

在隔離資料庫把一張已審核 scan item 的 `delete_after` 調成過期並重啟 backend，驗證：

- production image bytes 被清空
- production image endpoint 回傳 404
- scan / formal data 不因圖片到期而刪除
- 明確勾選保留的 Training Dataset 圖片副本仍存在

正式規則仍是「團別回國日 + 7 天」，驗收腳本只是對隔離測試資料強制製造過期條件。

### F. Backup / Restore

驗收腳本使用既有：

- `scripts/backup-db.ps1`
- `scripts/restore-db.ps1`

但指定同一個隔離 Docker project。

驗證：

- PostgreSQL custom-format dump 可建立
- SHA256 sidecar 存在
- backup 後建立一筆 marker data
- restore 後 marker 消失
- 原 backup snapshot 的團別／Traveler／DocumentVersion 回復
- restore 後 frontend / backend 可再次啟動

不會 restore 正常開發資料庫。

### G. Restart persistence

最後再重啟 backend，確認已建立的正式團員與兩份證件仍存在。

## 3. 仍需要一次真實瀏覽器驗收

自動腳本通過後，只剩下無法安全用假資料替代的 UI／真實影像驗收。不要再重跑 D-124～D-129 OCR 研究。

使用私人本機資料完成以下一次整批驗收：

| 項目 | 驗收條件 |
| --- | --- |
| 批次上傳 | 護照、台胞證、身分證皆能批次選檔並完成；單張失敗不拖垮整批 |
| OCR retry | 失敗項目可重新處理，成功項目不重複建立 |
| 護照中文姓名 | v5 正式主模型維持原安全門檻；v6 只在需要時提供人工候選，不自動覆寫 |
| 人工審核 | 照片可 zoom / pan / 左右旋轉；修改後可儲存；已審核資料可重新編輯 |
| 版本 | 同旅客多份同類證件可切換並顯示版本；「最新掃描」不得被描述成「最新核發／目前有效」 |
| 人工合併 | 相同人物可人工合併；中英文姓名明確衝突時必須阻擋 |
| CSV | 只輸出正式已審核資料；可選總表／證件表、勾選欄位、拖曳排序；下載後中文與欄位順序正確 |
| Docker restart | 正常 `docker compose up -d --build` 後原資料仍存在 |
| 正式備份 | 執行一次 `backup-db.ps1`，把 dump 與 SHA256 保存到私人位置，不上 GitHub |

## 4. V2 release gate

V2 可以開始旅行社內部實際使用的最低條件：

1. `verify-v2-launch.ps1` 全部 PASS。
2. 上述真實瀏覽器驗收全部 PASS。
3. 沒有會造成錯人合併、已審核歷史消失、CSV 輸出待審核 OCR、照片永久保存或 DB 無法還原的 blocker。
4. OCR 仍保留人工確認；不得把人工修正後資料宣稱為 OCR 自動 100%。
5. 正式 OCR baseline 仍以已驗證數字記錄：護照 14/19、台胞證 13/13；PP-OCRv6 的人工候選不計入正式全自動正確率。
6. 禁止啟動 GitHub Actions；驗收全部在本機完成。

## 5. 上線後策略

投入內部使用後，優先記錄實際操作 blocker、錯誤合併、漏存、匯出錯誤、圖片保存及 backup 問題。

OCR 新研究只有在真實使用資料顯示明確痛點，且能形成獨立可驗證假設時才重新啟動；不再為固定 19 張無止境堆疊 ROI、contrast、拼音 fallback 或 shadow 規則。


## 2026-10-19 自動驗收結果
- 操作者回報於原 Windows 主機執行 `scripts/verify-v2-launch.ps1` **成功**；本對話未提供完成畫面逐行輸出，故驗收來源為使用者回報，而非本環境自行執行。
- 自動測試階段已結束，轉進「第 3 節真實瀏覽器驗收」。這不代表已完成真實護照、台胞證、身分證的全流程 UI 驗收，也不代表 OCR 辨識率增加。
