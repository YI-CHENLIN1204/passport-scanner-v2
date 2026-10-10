# 工作紀錄（append-only 摘要）

> 每輪新增一段，**不要覆寫舊紀錄**。若後來推翻舊結論，新增更正並連到舊條目。詳細設計見 [DECISIONS.md](DECISIONS.md)；交接入口見 [HANDOFF.md](HANDOFF.md)。

## 每輪紀錄模板

```md
### YYYY-MM-DD — 工作主題
- 狀態：提案 / 實驗 / 已實作 / CI 通過 / 本機已測 / 正式採用 / 未採用
- 目的 / 問題：
- 之前已知結論（避免重做）：
- 變更範圍（程式與文件）：
- PR / commit：
- 驗證：CI run、人工測試（樣本、環境、限制）
- 結果與沒做的事：
- 殘留問題 / 下個行動：
```

## 2026-10-10 — 建立永久交接規範（本輪）

- 狀態：文件流程建立中（以 PR / CI 為準）。
- 目的：把歷史研究、決策、失敗原因、實測數據與下一步固定存進 GitHub，後續換對話／電腦／Agent 不重新走回頭路。
- 變更：新增 `docs/HANDOFF.md`、`docs/WORKLOG.md`；更新 `docs/PROJECT_CONTEXT.md` 的導航。
- 已知事實：正式 OCR `2026.10.09.1` 未動；最近一次主要程式變動為 PR #9 的 Validation 姓名分類診斷；PR #9 CI #771 通過、main 合併後 CI #772 通過。
- 待完成：把本輪 PR / commit 與 CI 加回本條目（下一次修改時）；往後每輪執行 template，並確保狀態真實。
- 下一步：正式 auto Validation 五分類；按結果再決定是否進行 shadow selector 實驗。

## 2026-10-10 — 迄今 OCR 實驗結果索引（歷史摘要）

- PR #3：新增只讀 Validation Profiler；不可修改固定 Test；CI #753 通過。
- PR #4：隔離的 WASM direct / Worker 實驗，並保留 production auto；CI #762 通過。
- PR #5：避免把舊成功卡片誤當新一輪完成；加入欄位 exact rate；CI #763 通過。
- PR #6：修復初始化例外被吞掉、無法診斷 Worker 0/32；CI #765 通過。
- PR #7：修正 ORT `.mjs` loader 漏部署，並測 Vite / nginx 同源資源；CI #767 通過；本機後續 Worker 32/32 成功。
- PR #8：加入實際 provider（本機正式 auto 偵測與辨識皆為 WebGPU）與匿名護照姓名錯誤診斷；CI #769 通過。
- PR #9：將「完整候選吻合」和「僅 OCR 長行包含姓名」拆開；CI #771、main #772 通過。**尚待新五分類結果**。
- 一次 Validation 實測（護照 19、台胞證 13、無身分證）：正式 auto 護照 1.4 秒、37%，台胞證 1.0 秒、38%；WASM direct 7.9 秒、37% / 5.9 秒、31%；Worker 8.9 秒、37% / 5.8 秒、31%。各模式 32/32 成功，原 OCR 工作輸入影像 0/32。詳細 caveat 見 [OCR_OPEN_SOURCE_REVIEW.md](OCR_OPEN_SOURCE_REVIEW.md)。
- 決策：目前保留 WebGPU auto 為正式路線、**不正式導入 Worker**；精準度重點先看中文姓名，而不是重造 OCR 引擎。

## 2026-10-10 — 正式證件歷史獨立／禁止 fallback（歷史摘要）

- PR #1：已審核紀錄不能以一般刪除流程刪除，不依掃描順序回退舊證件；對應 D-084，取代舊 fallback 行為。CI #747 通過。
- 記住：`Traveler`（目前人物主檔）、`DocumentVersion`（新舊證件歷史）和 `TourMemberDocument`（某團當時用的證件與 snapshot）必須分清。更正某團資料應另設明確、可審計流程。

## 2026-10-11 — 正式 auto Validation 五分類結果

- 狀態：使用者本機已測；原因定位仍在研究；**尚無正式 OCR 選擇器改動**。
- 測試：32/32 完成，護照 19、台胞證 13；det/rec provider 都是 WebGPU；護照完整正確 37%、台胞證 38%；護照中文姓名失敗 12 張，分類：**完整候選吻合 7、原始行吻合 0、僅子字串 0、候選不符 5、無候選 0**。
- 關鍵發現：7 張已有完整正確文字，但不確定為何沒有成為正式輸出。這不等於可藉調整 selector 完成 7 張修復；需要 eligibility / score / phonetic trace。
- 限制：32/32 沒有實際 OCR 工作圖，使用保存審核影像代替；不代表端到端辨識率。
- 原碼核對：`frontend/src/services/paddleOcr.ts` 的 `chooseTaiwanChineseName()` 有位置、Romanization compatibility、confidence 與 rank 相關條件。
- 決策：先做不改輸出的 shadow selector 診斷，不改 OCR baseline、不放寬正式 threshold。
- 參考：`docs/OCR_OPEN_SOURCE_REVIEW.md` 2026-10-11 節。

## 2026-10-11 — Validation shadow selector decision trace

- 狀態：實驗性診斷程式，待 CI／使用者本機 Validation 實測；**正式 OCR 選擇器輸出不變**。
- 緣由：護照中文姓名錯誤 12 張中 7 張有完整候選。還不知道卡在幾何 anchor、MRZ romanization、分數、unknown 門檻，或較高排名候選。
- 變更：在既有 `chooseTaiwanChineseName()` 增加可選的匿名候選決策回報；Validation 比對人工答案後，僅儲存原因分類並顯示聚合張數。未觸發的預設流程不改回傳值。
- 限制：OCR 可能執行多次 crop／orientation；候選出現於一輪不代表該輪是正式最終來源。分類為近似診斷，不能當成已修復張數。原工作圖仍 0/32，不能外推端到端準確率。
- 下一步：跑正式 auto Validation 觀察各分類；確認是否值得另做 shadow selector 候選 A/B，不直接修改正式輸出。
