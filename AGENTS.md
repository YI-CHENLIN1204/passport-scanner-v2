# AGENTS.md

本文件提供給 Codex、AI coding agent 與協作者。開始修改程式碼前，**必讀 `docs/HANDOFF.md` 頂端最新狀態、`docs/WORKLOG.md` 末尾、`docs/DECISIONS.md`、`docs/OCR_OPEN_SOURCE_REVIEW.md`**，再查最新 main SHA、PR、CI 與實際程式；下方過去的優先序不能凌駕於明確最新交接。

## 專案目標

建立 Passport Scanner V2：旅行社內部使用的證件掃描系統，核心是瀏覽器端 OCR、人工覆核、旅客主檔／證件版本管理，以及由團別頁手動匯出 CSV。

## 必須遵守

- V2 的 OCR 推論必須在使用者瀏覽器端執行。
- 不可自行改成把證件影像送到雲端 OCR API。
- 不可假設護照一定是台灣護照；必須依證件實際內容辨識國籍與簽發國。
- 台灣身分證號必須做檢查碼驗證。
- 不要新增沒有明確分析或業務價值的證件欄位。
- OCR 結果必須經人工覆核後才可成為可信資料。
- V2 不做 ERP 整合。
- V2 不做 CRM 系統；Traveler / DocumentVersion 只是掃描系統所需的正式旅客與證件資料層。
- V2 不做複雜登入／角色權限系統。
- V2 正式匯出格式為 CSV；欄位選擇與排序由使用者在匯出視窗設定。
- 未經文件確認，不要自行擴充 V3 / V4 功能。

## 目前開發優先順序

- **固定 Test baseline** `2026.10.09.1` 凍結、不得反覆調參；**它不是目前正式 OCR 程式版本**。最新 main OCR pipeline 於 2026-10-11 為 `2026.10.11.5`，其新變動尚未取得用戶的實際 Validation 結果，後續以 `docs/HANDOFF.md` 最新段落查證。
- 使用者**已明確要求加速推進 OCR 精準度改善**。必須集中有依據的修改、自動化回歸，並以一次 Validation 檢驗淨改善／退步；不得擅自改固定 Test split 或把未實測 PR 說成精準率提升。
- 不要把固定 Test 圖片加入 Train；Train / Validation / Test 仍以 Traveler group 切分，避免同人資料洩漏。
- 現階段優先完成 V2 系統本體：團別收件、批次掃描生命週期、人工審核、Traveler / DocumentVersion、人物合併、資料一致性、production photo retention、Training Dataset 管理、CSV 匯出與備份／還原。
- OCR 歷史 PoC 文件可保留作技術歷史，不可因舊文件的 TODO 將已凍結 OCR 工作重新當成目前優先事項。

## 隱私與敏感資料

- 證件影像、身分證字號、護照號碼都視為敏感資料。
- 不可把真實 API key、金鑰、密碼、服務帳號憑證提交到 Git。
- 使用環境變數或 GitHub / 部署平台的 secrets。
- 若建立範例設定，只提交 `.env.example`，不可提交 `.env`。
- 原始照片的保存期限必須依 docs/DECISIONS.md；若該規則仍標示待定，不可擅自改成永久保存。

## 實作方式

- 每次新增功能前，先對照 docs/DECISIONS.md。
- 若文件互相衝突，以較新的「已確認決策」為準。
- 如果需求尚未定案，先以最小可逆方式實作，不要把假設寫死。
- 優先建立小而清楚的模組，避免一次做過多未確認功能。
- 所有 OCR 欄位都應能記錄辨識信心或至少提供人工修改入口。

## 目前不是 V2 目標

- 旅客自行上傳證件。
- 伺服器常駐 OCR。
- 即時 ERP 寫入。
- 全自動無人工審核。
- 複雜 RBAC 權限。
- 把三類證件的所有可見欄位全部 OCR / 儲存。
