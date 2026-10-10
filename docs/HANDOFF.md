# 護照掃描系統 V2 — 交接入口（持續維護）

> 這份文件是新對話、新開發者或 AI Agent 接手本 repository 時**優先閱讀**的入口，不應以聊天紀錄當唯一知識庫。
> 每次實質修改與實驗結束後更新本文與 `docs/WORKLOG.md`；在 CI 通過後提交 GitHub。請先核對 GitHub main 最新 SHA 和 CI，**不要把這份文件的 SHA 當永遠最新**。

## 接手時閱讀順序

1. 本文：現況、禁區、下一步與交接方法。
2. [工作與實驗紀錄](WORKLOG.md)：依日期追查做過什麼、是否有實測及結論。
3. [正式設計決策](DECISIONS.md)：核對已生效的決策，尤其 D-072、D-084。若文件有衝突，找出最新取代關係，不能自行猜測。
4. [資料模型](DATA_MODEL.md)、[系統架構](SYSTEM_ARCHITECTURE.md) 與 [開發／備份指引](DEVELOPMENT.md)。
5. OCR 問題另讀 [開源技術研究及真實測試](OCR_OPEN_SOURCE_REVIEW.md)、[OCR 需求](OCR_REQUIREMENTS.md)。

## 專案定位與不能重新設計的邊界

- GitHub：`YI-CHENLIN1204/passport-scanner-v2`。
- V2 是**旅行社內部的團別證件掃描、旅客資料建立／審核與 CSV 匯出工具**。不是 ERP、CRM、旅客自助端。V3/V4 才討論自助、伺服器常駐及進一步一鍵化。
- 流程：建團 → 設定證件 → 批次上傳 → **瀏覽器端 OCR** → 自動歸組／人工合併 → 人工審核 → Traveler / DocumentVersion / TourMemberDocument → CSV。
- 團別使用的證件資料與全域主檔、歷史證件版本彼此獨立。已審核 ScanItem 不接受一般刪除；**不能自動 fallback 舊證件**。更正／撤銷正式資料需要另外設計可追溯流程，不可暗中改寫別團歷史。
- 結構化資料的保留與圖片生命週期不同；production 原圖仍按原定回國日 + 7 天清理，不能為了 AI 訓練默默放寬期限。
- 旅客證件圖片、未匿名化測試結果與私人 Dataset **不得放進 GitHub 或傳第三方線上 Demo**。

## OCR 現況與已確定的事（截至 2026-10-10）

- 已使用 **PaddleOCR.js + PP-OCRv5** 瀏覽器端 SDK，搭配本地 MRZ / parser、角度／裁切及人名候選邏輯；請先閱讀原碼，**不要重新引入另一套 PaddleOCR**。
- 正式 OCR pipeline `2026.10.09.1` 凍結。固定 Test split / baseline 不能拿來反覆調參。只可在 Train/Validation 做候選實驗，通過既定 gate 才討論修改正式版。
- 現有 32 張 Validation：護照 19、台胞證 13、身分證 0；**32/32 沒有保存當次真正 OCR 工作輸入圖**，改用當時保留的審核影像，因此只能用來做 legacy regression，不能稱作端到端上傳準確率。
- 使用者同機實測：正式 auto 護照 Median 1.4s／整張 37%，台胞證 1.0s／38%；單執行緒 WASM direct 護照 7.9s／37%，台胞證 5.9s／31%；WASM Worker 護照 8.9s／37%，台胞證 5.8s／31%。皆完成 32/32。單次小樣本，不能宣稱統計顯著差異。
- 正式 auto 在該次 Chrome 測試的 detProvider 與 recProvider **均為 webgpu**。這是測得的裝置／session 狀態，不代表所有環境均如此。
- Worker 曾因未部署相容的 `ort-wasm-simd-threaded.jsep.mjs` 而初始化在 0/32 失敗；PR #7 同步配送 ORT `.mjs` + `.wasm` 及加測 MIME / 同源資產，後續 32 張 Worker 測試成功。**不要再重做這條排錯路徑**。
- 護照中文姓名 7/19 exact，另外 12 張舊分類為「正確但未選中 7、有錯誤候選 5、無候選 0」。但舊分類把 raw OCR **包含**正確姓名片段當作完整候選。PR #9 已修改 Validation 診斷為五個互斥分類（完整候選、完整原始行、僅片段、候選不符、無候選），新版五分類已實測：7 張為完整候選吻合、0 張原始行吻合、0 張僅字串包含、5 張候選不符、0 張無候選。尚不能直接斷言 7 張皆能靠 selector 修好；需分析位置、score、拼音與 threshold。
- 台胞證正式 auto 中文姓名 46%，性別 77%；尚不能只靠改門檻解決。
- **目前不導入 Worker 至正式掃描**，因這批實測沒有看到它相對同 WASM direct 的效能優勢；正式 OCR 流程未被這些 Validation-only 工具變更。

## 接下來真正要做的事情

1. **已取得新版五分類 Validation 實測**（正式 auto：完整候選 7、候選不符 5）。PR #12 shadow selector 已本機實測：護照 7 張完整正確候選全部分類 romanization-conflict。PR #14 拼音子類診斷已合併且使用者本機實測：完整候選遭拒的 7 張全屬 one-syllable-mismatch。PR #16 的匿名單音節 shadow 已合併；PR #17 官方拼音 shadow 已合併：護照相對舊正式版潛在改善 6/19、退步 0，單音節放寬則 7/19、退步 0，皆為裁切近似比較。新分支 feat/guarded-boca-name-suggestion-v2 將唯一且高信心的官方拼音候選作為待人工審核建議，正式 pipeline 版本擬升至 2026.10.11.1；需要真正 Validation 證實，不能直接宣稱 68% 正確率。
2. 針對分類結果，必要時設計**不影響正式輸出**的 shadow selector A/B。不可只看到正確字串就自動採用；須保留位置、羅馬拼音與人工覆核規則。
3. 陸續累積合法、人工確認且保存當次 OCR 工作影像的 Validation，按 Traveler 分組避免資料洩漏。身分證 Validation 目前沒有代表性。
4. V2 尚待獨立設計正式已審核資料的撤銷／更正審計流程；不要把 fallback 或「刪除」當成更正。
5. 若 CI / 本地與本文敘述不一致，**以實際 main 原碼及測試為依據更新文件**，並註明查證時間，不能靜默改歷史結論。

## 不走回頭路：每輪工作必須遵守

1. **先讀文件 + 檢查 main SHA、近期 commit、CI、相關現有函式**；已有實作與已否定方案先列出，不再做一遍。
2. 修改在分支／PR 進行；需區分**想法、正在實驗、已實作、CI 已驗證、使用者本機實測、正式採用、已否定**，不能混成同一狀態。
3. 每一項變更至少留下：日期、目的與觀察、文件／程式路徑、PR / commit、驗證方式與結果、殘留風險、下一步。數據寫樣本數、分組、測試裝置與限制；不能憑印象填寫。
4. 更動架構與業務行為同步記錄在 `DECISIONS.md`；OCR 研究／失敗原因記在 `OCR_OPEN_SOURCE_REVIEW.md`；**所有輪次的摘要記在 `WORKLOG.md` 並維護本文當前狀態**。
5. 只寫 repository 內可公開且不包含旅客個資的記錄；不要提交原圖、掃描結果、姓名、證號、私密 Dataset、金鑰或資料庫 dump。
6. 檢查相關 CI，標示精確 run number；如果 CI 未完成，明寫 `pending`，不能聲稱成功。必要時使用 PR、等待綠燈後再合併。
7. 結束對話前附上可點開的 GitHub 文件與 PR / SHA；下一次接手**從這裡繼續，而不是從聊天推回所有決策**。

## 快速交接啟動指令（給下一個開發者 / Agent）

「請先讀 `docs/HANDOFF.md`、`docs/WORKLOG.md`、`docs/DECISIONS.md` 與 `docs/OCR_OPEN_SOURCE_REVIEW.md`，再查 GitHub `main` 最新 commit 與 CI。不要重做已完成的 OCR Worker 問題或改固定 Test baseline。依工作紀錄未完成事項繼續；每輪變更更新文件、開 PR、跑 CI 後再合併。」

### 2026-10-11 最新交接指標（覆蓋舊的待驗證敘述）

- PR #18 `2026.10.11.1` **已由使用者本機實測正式 OCR**：護照 13/19（68%），從舊版 7/19（37%）增加 6 張；其他欄位 100%。之前提到的「68% 尚未證實」已由本次 legacy Validation 證實，但不代表新照片端到端效能。
- 台胞證仍為 5/13 整張全對、6/13 中文姓名、10/13 性別；新分支 `feat/permit-conservative-name-sex-evidence` 修復保守姓名／性別 evidence precedence，擬更新 OCR pipeline 至 `2026.10.11.2`；需 CI 和本機測試後才確認效果。
- 所有 32 張皆無原始 OCR 工作輸入圖；Test baseline `2026.10.09.1` 不做調參，新正式 pipeline 目前 `2026.10.11.1`，不得混淆。
- 下一步：確認台胞證修正 CI，集中跑一次 Validation，比對是否有淨改善；避免每個小變動重新要求用戶測試。

### 2026-10-11 04:32 回歸：台胞證改善未達成

- 正式 OCR `2026.10.11.2`：護照 13/19 68% 持平；台胞證 5/13 38% 全對、6/13 46% 中文姓名、10/13 77% 性別，與前版**完全持平**。PR #19 的保守條件修正未在這組 Legacy Validation 顯示改善。
- 新開發分支 `feat/permit-name-uncertainty-retry`（版本預計 `2026.10.11.3`）將原本「僅空白才重辨識」擴展為低信心非空白姓名的受限雙裁切重試，並在同一次 Validation 加入匿名簡繁字形可能相當的計數。
- **未取得新的實測改善數字**。下一步 CI 成功後，只需單次 Validation 核對效能及姓名／性別的精準度。固定 Test 不動，32/32 實際工作影像仍缺失。
