# 護照掃描系統 V2 — 新對話交接（2026-10-12）

## 2026-10-15 — PP-OCRv6 truth-blind spatial name proposal (experimental)
- Recent new Windows validation again confirmed production v5 .29 = passport 14/19, permit 13/13 after isolated database restore. Existing v6 local RapidOCR same-sample pilot found one independently exact full name among four v5 candidate misses, with box, score and upper-ROI evidence; **not** a proven production rescue.
- Added `training/experiments/v6_name_gate.py`, a standalone conservative *truth-blind* proposal stage: scan v6 recognized boxes without consulting ground truth; require 2–4 Han characters, recognition score >=.75, upper portion of ROI, and close same-row label '姓名' / '中文姓名'. No MRZ acceptance, no automatic traveler mutation. Missing geometry/score => no proposal.
- Existing private `bench_ppocrv6.py` now reports `truth_blind_spatial_gate`: unique correct/wrong, ambiguous, none, and unique correct/wrong among the four actual .29 candidate-misses (ground truth used **only after** proposal selection for evaluation). A true proposal can be wrong; check false positives before any deployment. A real passport with no '姓名' OCR anchor may fail this strict trial; do not interpret 0 as model regression.
- Added no-private-data synthetic tests; neither Python local full pilot nor browser production run was executed here. No changes to production .29, permit, database, Docker, or Test; never run Actions. Code authored on main, not yet empirically validated.


## 2026-10-13 — Confirmed same-sample PP-OCRv6 Small complementarity on Windows
- User ran local PRIVATE ZIP + local current-production .29 missing-candidate/selector-blocked index against RapidOCR PP-OCRv6 Small. Observed `processed=19`, `standalone_exact=14`, `substring_only=2`, `failures=0`, `median_roi_ms=671` and `production_29_overlap={confirmed_missing_candidates:4, v6_standalone_rescue:1, v6_substring_potential:0, v6_absent:3, confirmed_selector_blocked:1, index_complete:true}`.
- This is the first actual **same-sample** additional complete name recognition candidate among the four genuine .29 candidate misses. It is NOT yet a confirmed end-to-end rescue: ROI model was run in local Python RapidOCR, not the browser; final name geometry/strict MRZ acceptability and regression on original correct 14 must be tested. Do not claim 15/19 as observed production accuracy.
- Model uses PP-OCRv6 Small via RapidOCR with its own pre/postprocessing. Prior PP-OCRv5 Server / chi_tra produced zero standalone rescues. Prioritize an isolated, browser-compatible v6 candidate integration gated by strict MRZ, use on true failure cases only. No private labels/photos/IDs in repo; never activate GitHub Actions.


## 2026-10-13 — v6 paired same-sample verification
- Windows v6 Small pilot verified: 19 Validation PASSPORT, standalone exact 14, substring-only 2, failures 0, median ROI 610ms. This is not 16/19 production accuracy. Historical export original OCR proxy is mostly unknown and cannot prove .29 rescues.
- Add one-time local-only export of the current-page complete production .29 missing-candidate and selector-blocked sample IDs. Export is available only when the current production Validation finished without failure; it contains opaque sample IDs, not names, ground truth or photos. Do not share/upload index to GitHub. Refresh clears page index.
- Python PP-OCRv6 pilot accepts `--production-index <local-json>` and joins with private ZIP manifest IDs locally; reports aggregate number of confirmed .29 missing-candidate passports rescued as standalone or substring-only, plus whether index membership matched. Both inputs stay local; no identifying strings displayed. Do not treat substring-only as selected name.
- Requires redoing one formal .29 Validation in browser to re-create the session-only index (unless that completed page is still open), but does not require rerunning Python v5. Production OCR and Test are unchanged. No GitHub Actions. Windows build pending.


## 2026-10-13 — PP-OCRv6 Small local RapidOCR pilot (new candidate architecture, untested on personal data)

Literature gate: RapidOCR v3.9+ officially supports PP-OCRv6 small/medium ONNX multilingual recognition with Traditional Chinese. RapidOCR project reported recognition standalone exact accuracy 0.8419 for PP-OCRv6 small vs 0.7355 for PP-OCRv5 mobile on their public recognition dataset; **these are not our passport measurements** and model/version/config comparisons need caution. Sources: https://rapidai.github.io/RapidOCRDocs/latest/model_list/ and https://rapidai.github.io/RapidOCRDocs/latest/blog/2026/06/18/rapidocr-%E9%9B%86%E6%88%90-pp-ocrv6-rec-%E6%A8%A1%E5%9E%8B%E8%AE%B0%E5%BD%95/

New experiment `training/experiments/bench_ppocrv6.py` runs RapidOCR's **correct v6 preprocessing and dictionary** locally rather than silently substituting a v6 ONNX into `@paddleocr/paddleocr-js@0.4.2` configured for v5. Requires Python 3.10+, `py -m pip install "rapidocr>=3.9,<4"`; export PRIVATE ZIP from OCR 品質 page to a local private directory, then `py training/experiments/bench_ppocrv6.py C:\\private\\ocr-training-dataset.zip` at repository root. The runner reads **only** `splits/validation.jsonl`, **only** `PASSPORT` images and ground-truth, at most 19, never Test/Train image bytes. It uses broad approximate VIZ ROI 24–98% width, 12–70% height with no production rotation/upscaling; results are anonymous aggregate standalone candidate matches and inference times, **not** a production end-to-end benchmark. It never prints/saves recognized strings, personal names, IDs or images. Model weights may download from RapidOCR public model repositories; private input images stay on the local machine. Keep zip OUTSIDE Git and never paste full OCR text.

Scope: only an optional pilot, not a replacement of browser-based production; no backend deployment or cloud image transmission. Need to establish 1) model initialization locally, 2) whether it rescues any of the four actual .29 misses (this 19-image aggregate alone does NOT establish same-sample rescue), 3) on-device browser Worker compatibility+dictionary and strict security gates before integration. Python pilot is not tested here with real ZIP or installed RapidOCR; do not claim accuracy gains. Formal baseline remains passport 14/19 and permit 13/13. No Actions.


## 2026-10-13 — Validation 樣本品質匿名稽核（尚待本機驗證）
- 使用者懷疑持續 14/19 的問題包含早期隨意保留的測試樣本，且過去不清楚如何取消。已確認後端 `SetSelection(false)` 會移除一般 `TrainingSamples` 複本，但保護固定 Test baseline；操作入口在原團別證件審核視窗「保留此樣本供 OCR 改善」勾選框，不能把排除訓練樣本誤當成刪正式旅客／已審核證件。
- 在 OCR 品質頁新增只讀 Validation 人工標準答案匿名稽核（不執行 OCR、不下載照片、不讀 fixed Test）：中文姓名缺漏、出生日期格式與明顯可疑年份（1900 年以前或未來）、已填但驗證失敗的台灣身分證字號、簡單占位文字訊號。只輸出整體數字，不輸出任何姓名／字號／樣本 ID；每一異常是待人工確認而非自動剔除。沒有填身分證號的護照不視為錯誤。
- 正式 OCR 與 dataset selection API 不變。新增 source static guard 並接入 `verify:ocr`。未進行 Windows 編譯或真實盤點，不能宣稱 19 張中有任何一張真的是假資料，也不得藉由刪掉失敗樣本冒稱模型改善；保留既有 14/19、13/13 基準與歷史結果。
- 禁止 GitHub Actions、真實證件影像或個資提交至版本庫。


## 2026-10-13 — Windows independent chi_tra OCR first true 4-sample result
- User screenshot: after completed same-page production Validation, independent Tesseract `chi_tra` on 4 verified missing-name-candidate passports completed successfully: compared 4, standalone exact Chinese name 0, errors 0; Worker init 989 ms, combined broad VIZ ROI recognition 42,950 ms (~10.7 s each). No end-to-end rescue demonstrated; do not promote to production or ask to repeat same run.
- Independently, same screenshot shows same-ROI PP-OCRv5 Server test on one verified miss: Mobile exact 0, Server exact 0, rescue 0, two pipelines detect/recognize 29 boxes; Server total ~20,060 ms. Thus neither existing server experiment nor this independent Tesseract exact-standalone match has demonstrated benefit.
- Crucial interpretation: `containsStandaloneChineseName` accepts only exact standalone row (or 姓名 prefix) and may miss true characters spread across multiple OCR lines/with noisy labels. **0 exact is not proof of 0 useful individual characters**. Before another model or crop effort, compute anonymous partial-evidence categories on existing chi_tra results (do not log candidate/ground truth), or examine safe aggregate patterns. Keep current production passport 14/19 and permit 13/13 until real improvement.
- No GitHub Actions, image/PII upload, Test cohort usage or new production behavior.


## 2026-10-13 — 新增不同中文 OCR 引擎的 4 張缺候選護照隔離實驗（待 Windows 實測）
- 先前真實 32/32 Validation 再次確認護照 14/19、台胞證 13/13；已實驗的 PP-OCRv5 Server Recognition 在一張真實缺候選樣本上救回 0，耗時高，不再投入相同模型。
- 這輪使用現有 `tesseract.js@^7` 新增**不同於 PaddleOCR**的繁體中文 `chi_tra` LSTM Worker。獨立服務 `alternativeChineseRecognition.ts` 重用既有 broad VIZ ROI（不是正式姓名選取），只在同頁完成 production Validation 後讀取其 session-only `currentPageRecognitionMissPassportSamples`，最多四張護照，使用同一 Worker 依序運行；不讀 Test、不更新正式旅客與 OCR、不上傳證件照片、不保留 OCR 全文、不顯示姓名。
- 品質頁新增 `INDEPENDENT CHINESE OCR` 比較按鈕，匿名顯示比較張數、完整獨立姓名候選命中張數、錯誤數、模型 init / ROI 推論耗時。每次用完 terminate Worker、撤銷 Blob URL。中文語言包由 Tesseract.js 在首次執行時取得，可能需要網路；不得將這種本地運算誤稱無外部下載。
- 此實驗只衡量 Tesseract 是否能產出 Paddle 缺少的獨立完整姓名文字；它不是 production .29 的新準確率，更不是確認 MRZ selector 能接受。只有觀測到額外正確候選，後續才考慮嚴格錨點、拼音、效能及真實安全整合。
- 加入 `test-alternative-chinese-recognition.mjs` 靜態 isolation/privacy guard 與 `verify:ocr`。尚未執行 Windows npm verify / docker / browser 測試；沒有 GitHub Actions，沒有個資進版控。


## 2026-10-12 — Windows 實測：32/32 完成，joined-Han 無淨改善；兩種 Server A/B 均 0 rescue
- 使用者提供兩張本機截圖（不含證件圖片／姓名）：正式 auto 模式 `2026.10.11.29`；Validation 32 張，失敗 0。護照 19 張：整張與中文姓名 14/19（74%），其餘必要欄位各 19/19；台胞證 13 張：整張與中文姓名及必要欄位皆 13/13。這與前版相同；新增相鄰漢字框合併沒有觀察到淨提升。
- 5 張護照姓名失敗細分：4 張缺完整正確候選（即受診斷覆蓋限制的 recognition-candidate miss），1 張完整正確候選存在但 selector 的 `romanization:one-syllable-mismatch` 阻擋。候選源摘要：姓名欄位正確候選 1、broad VIZ 正確候選 1、focused VIZ 正確候選 0；屬不同 crop 的證據，勿把加總當成不同樣本數。
- 同頁有已確認錯誤索引：5 張錯誤，4 張缺候選、1 張 selector 阻擋。same-ROI A/B 選中一張真正缺候選的樣本：Mobile exact 0，Server exact 0，rec rescue 0；Mobile ROI 3,791ms（det 1,094ms、rec 2,660ms），Server ROI 19,689ms（det 929ms、rec 19,665ms），各辨識 29 框。完整單張 Server WASM Worker A/B：Server correct 0、rescue 0、error 0；含模型啟動／釋放約 63,210ms（P50/P90 約 63,210ms）。
- Server smoke 合成圖像在 WASM 成功（約 2,207ms）只表示模型可運作，非真實準確率。歷史 baseline 19/19 無可解析記錄，勿使用歷史錯誤優先選樣。
- 決策：不再重跑相同的 joined-Han 規則、舊 ROI／裁切、PP-OCRv5 Server WASM 或放寬 strict MRZ，一律不宣稱準確率進步。下一階段要分析四張缺候選的影像辨識失敗根因與不同技術的獨立候選能力；另一張 one-syllable selector 問題保持隔離、不可盲改。
- 此輪僅記錄用戶的真正 Windows 實測結果；尚未更動 production、未啟動 GitHub Actions，也未上傳證件圖片或個資。


## 2026-10-12 — Joined-Han selector executable synthetic test (unverified locally)
- Follow-up to `b459f08a` and `83068160`: existing `test-passport-joined-han-name.mjs` only regex-scanned code. New `frontend/scripts/test-passport-joined-han-functional.mjs` reads the actual `chooseTaiwanChineseName()` function source, transpiles that TypeScript function with the existing `typescript` dependency, injects synthetic geometry and controlled phonetic matcher, and asserts output behavior instead of merely checking text patterns.
- Synthetic scenarios include an adjacent Han split, weak second box, horizontally distant box, wrong row, strict MRZ mismatch, missing name anchor and already-accepted full box. No real names/documents are read; any synthetic Chinese names are fictitious.
- Wired this test into `test:ocr-regression`, hence `verify:ocr`. No production selector/model/version change, no GitHub Actions. **Important:** these tests were authored but not executed in a checked-out npm environment here; full `npm.cmd run verify:ocr`, typecheck and true Validation are still pending. Do not treat synthetic tests as evidence of improved real-passport accuracy. Previously observed passport 14/19 and permit 13/13 remain the only validated aggregate figures.


## 2026-10-12 — Joined-Han candidate must be visible to Validation (source consistency fix)
- Review of previous main `b459f08a` identified a measurement defect: `chooseTaiwanChineseName()` may return a unique strict-MRZ-compatible name formed by two adjacent Han OCR boxes, but `predictOne()` only collected candidateTexts from individual OCR items and assembled raw rows before selection. The correct joined fallback could therefore be absent from the Validation candidate set and incorrectly classified as a recognition miss.
- Fix: after `vizName` is returned, add its exact normalized name to the **transient** diagnostic candidateTexts if missing. The actual selector result, confidence, rank, production output and strict romanization remain unchanged by this diagnostic bookkeeping. No names/IDs persist or leave browser. Add regression guard in `test-passport-joined-han-name.mjs`.
- This is an accuracy-evaluation correctness fix, **not** evidence of new correct scans. No new 32-sample Windows Validation, npm compilation or browser runtime result. Keep formal best observed passport 14/19 and permit 13/13 until retested; never run GitHub Actions.


## 2026-10-12 — 保守相鄰漢字框候選恢復（待真實 Validation）
- 假設：部分護照中文姓名可能已被 PP-OCRv5 Mobile 辨為相鄰獨立漢字框，但正式姓名 selector 僅處理單個文字框；原有同行 raw-row 診斷不會成為 selector 候選。這是新候選產生路徑，不是重試先前失敗的 VIZ 裁切、放寬拼音或更換插值。
- 在 `chooseTaiwanChineseName()` 新增只限原本 `best` 不存在或低於原門檻的受限兩框拼接 fallback：每框 1–2 個漢字、score >= .82、水平接近且同行、鄰近「姓名」或 MRZ 對應拉丁姓名錨點，整個合併姓名必須使用原本嚴格 `compareChineseNameToMrzRomanization` 得到 `compatible`；多個不同合格合併結果則不使用。原既有成功候選不被覆蓋。
- 不變更台胞證、身分證或任何背景 OCR 模型；正式版本號維持 `2026.10.11.29` 以避免聲稱已提高準確率。新增 `test-passport-joined-han-name.mjs` 並接入 `verify:ocr` 靜態防回歸。
- 注意：此假設**尚無證據證實**四張失敗護照有相鄰完整漢字框。沒有新一輪 32 張 Windows 真實 Validation，也未完成本地 npm build / regression，不得把這批視為已驗證改善；先測編譯，再評估是否真實救回且沒有其他欄位退步。禁止 GitHub Actions 與個資提交。


## 2026-10-12 — 收斂完整 Server A/B 與匿名 selector 原因（待本機 verify）
- 程式檢查發現：ROI A/B 已限制為當頁正式 Validation 的缺正確候選護照，但舊完整版 Server A/B 按鈕仍依全體姓名錯誤啟用，會浪費 Server 對已存在正確候選卻遭 selector 阻擋的護照做完整 OCR。
- 現已將完整版 Server A/B 的啟用條件、session 選樣及執行前索引再確認，統一改為 `currentPageRecognitionMissPassportSamples`，維持一次最多一張、獨立 WASM Worker、使用原始 Validator 真實答案、無個資持久化。
- 同次完整 production Validation 的錯誤樣本，對 `exact-candidate` 另以既有 `passportExactDecision` 統計匿名阻擋原因（例如 one-syllable-mismatch、no-anchor、unknown-threshold）；只在完整無失敗 production Validation 後顯示 aggregate counts，重新整理消失，不保存原因對樣本的對應。
- 正式 pipeline 仍 `2026.10.11.29`、護照最新實測 14/19、台胞證 13/13；此批為診斷決策收斂，未宣稱辨識提升。新 source 回歸守衛已補，尚未跑 Windows `npm.cmd run verify:ocr` / browser Validation；未執行 GitHub Actions。


### 2026-10-12 — Separate confirmed recognition misses from selector blocks before future A/B
- After same-ROI Server took 17,989ms recognition vs Mobile 2,269ms and rescued 0/1, the unaudited ROI scan is a poor signal: it found a miss after screening 12 passports without knowing whether it was among five .29 end-to-end failures.
- Change the existing session-only complete production Validation index to capture two disjoint anonymous sample-key sets: `exact-candidate` (selector issue) and the remaining errors (no exact candidate in eligible OCR diagnostics). Do not persist keys, names or images; discard on incomplete Validation/page refresh.
- Gate ROI Mobile/Server experiments behind completed in-page .29 production Validation. Pass only confirmed missing-candidate passport samples to model experiments. Never run Server for already-correct OCR candidates merely blocked by strict MRZ name selection.
- ROI probe is still exploratory and not an end-to-end rescue. Keep same ROI/Worker and at-most-one Server call, Mobile scans at most five confirmed missing-candidate passports; production `.29` and permit 13/13 code unchanged. Never use historical baseline to infer sample failures.
- No model accuracy improvement claimed; new code requires npm verify/build and browser validation. No Actions executed.


## 2026-10-12 — Same-ROI A/B 第二次 Windows 真實觀測：Server 0 rescue，Recognition 7.9x 成本

- 使用者 Windows OCR 品質頁截圖：最新 same-ROI probe 在 Validation 中掃描 12 張，Mobile broad VIZ ROI 已有 exact 中文姓名候選 11 張，第一張 Mobile miss 觸發 Server 比較（不是同頁完整 .29 error index 的已確認錯誤樣本）。缺人工姓名答案 0。
- 該 ROI Mobile exact 0、Server exact 0、Recognition 候選救回 0；兩者 detected boxes 29、recognized 29。Mobile init 1036ms，ROI wall 3162ms（det 863ms、rec 2269ms、SDK total 3136ms），dispose 6ms。Server init 1025ms，ROI wall 18933ms（det 907ms、rec 17989ms、SDK total 18905ms），dispose 10ms。
- 推論：Recognition Server/Mobile 17989/2269 ≈ 7.93x，Detection 接近，初始化不是主要耗時瓶頸。這一張沒有證實 Server 品質收益，但不能外推五張 .29 最終錯誤樣本全部沒有收益；11/12 ROI mobile exact 也不能視為正式姓名正確率或新 Validation。
- 決策：正式 production `2026.10.11.29` 維持 PP-OCRv5 Mobile，台胞證原路徑不動。暫停無選樣根據、無預期收益的完整 Server A/B 或盲目 ROI 掃描，不再要求重跑 32 張 Validation。若未來評估 Server，需以確定的 .29 錯誤索引或等效完整錯誤歸因為前提，並維持相同輸入、選擇條件及端到端淨改善門檻。
- 下一個有收益的方向：先分析四張缺少完整正確候選的實際影像失敗模式，以及一張已有完整候選但被 one-syllable mismatch 阻擋的 selector 證據；不放寬拼音、不盲加裁切。優先設計匿名、可驗證的判斷與有意義的替代模型 gate；不要因多出版本號或額外測試自稱提高準確率。
- 這輪僅記錄使用者實際觀測並更新文件；沒有新程式碼、npm verify、fixed Test 或正式 Validation 執行。禁止 GitHub Actions／個資上傳。

## 2026-10-12 — 相同 broad VIZ ROI Recognition A/B 已建置（待 Windows verify / runtime）

已確認目前使用的 `@paddleocr/paddleocr-js 0.4.2` 公開 browser API 沒有獨立 recognition-only 入口：公開 `PaddleOCR.predict()` 會先跑 TextDetection，再把 detected boxes 裁切後交給 TextRecognition；package exports 也沒有公開可直接建立 rec-only model 的 runtime。若為了這次 A/B 強行繞過，必須 fork / vendor SDK internal preprocessing，風險與維護成本過高，暫不採用。

main 新增更低成本、read-only 的 **same-ROI recognition probe**：完全重用 production `.29` 既有 broad VIZ crop，不新增 ROI、不改座標、不改 selector。每次最多先用 Mobile WASM Worker 掃 5 張 Validation 護照，只找一張同一 broad VIZ ROI 沒有 exact 中文姓名候選的樣本；找到後才啟動 Server WASM Worker，並把**同一個記憶體 ROI Blob**交給 Server。兩者使用同一 PP-OCRv5 mobile detector，只有 recognition model 不同。

probe 僅顯示匿名 Mobile / Server exact candidate、detected boxes、recognized count，以及 init / detection / recognition / SDK total / wall / dispose 時間；不顯示姓名、OCR 原文、證號，不保存逐張結果，不讀 fixed Test，不寫 benchmark。Mobile 掃描窗口若全都有 exact candidate，Server 完全不初始化。此 probe 不跑完整護照旋轉、MRZ、Tesseract 或 parser，因此**不是新的 .29 end-to-end 準確率**；用途是先確認 Server Recognition 本身是否能在相同姓名輸入上產生 Mobile 缺少的正確中文字候選。

新增 `frontend/scripts/test-server-recognition-roi-probe.mjs` 並接入 `verify:ocr`。提交前已對修改後 source 執行 connector-side 靜態 guard assertions（同 ROI、Validation-only、最多 Mobile 5 張、Server 僅在 Mobile miss 後啟動、無 persistence、stage metrics）並通過；但本環境無法取得 npm/GitHub 網路資源執行完整 `npm.cmd run verify:ocr`，故**尚未宣稱編譯或瀏覽器 runtime 驗證完成**。production pipeline 仍 `2026.10.11.29`，已實測基準仍護照 14/19、台胞證 13/13；GitHub Actions 禁止執行。


## 2026-10-12 — 19/19 baseline 缺失，改用本頁即時 Validation 暫存錯誤集合

使用者的匿名稽核顯示：19 張 Validation 護照中，可解析歷史 baseline 0、缺少 baseline 19、缺少人工姓名答案 0。故先前「歷史錯誤優先」沒有證據可用。上一張 Worker A/B Mobile 與 Server 都正確，沒有救回與退步，兩模型耗時超過 56 秒，不能代表 Server 提升辨識率。

已在 main 新增 session-only 記憶體集合：當本頁正式 production Validation 完整完成且沒有 OCR 失敗時，從該次逐張比對結果留下中文姓名判錯之樣本 key（非姓名、證號或 OCR 原文）；A/B 優先選該次失敗，再考慮歷史 baseline。若 Validation 中止、失敗或不是 production 模式便不用此集合。重新整理即清空，不寫資料庫、GitHub 或本機持久儲存；仍每次只跑一張、使用雙 WASM Worker。

注意：既有 .29 的 14/19 聚合結果無法反推五張失敗樣本；本次改碼不能自動還原舊索引。只有同一頁再完成一次正式 Validation 才能形成精確錯誤排序。已加入靜態回歸守衛，尚待本機 verify/build。正式 production OCR .29 不變，台胞證基準 13/13。不啟動 GitHub Actions、不上傳真實證件與個資。


## 2026-10-12 — 單張模型 A/B 優先取歷史姓名錯誤樣本（待本機驗證）

上一輪 Worker 隔離的實際 Validation 單張比較成功：Mobile 正確 1/1、Server 正確 1/1、救回 0、退步 0、錯誤 0，兩模型累計耗時約 57,455ms。這張本來就已正確，不能用以證明 Server 較好。正式 production OCR 仍 .29（固定 Validation 護照 14/19，台胞證 13/13）。

main 現將單張 A/B 的選樣改成：只讀 Validation PASSPORT，依既有 `evaluationBaselineJson.fields.nameZh` 與人工 ground truth 進行 **匿名優先排序**；先選歷史 baseline 中文姓名不正確的護照，之後才是其他樣本。這只是排序 proxy：歷史 baseline 可能不同於現在的 .29，因此沒有直接假設這五張就是 .29 的五張錯誤，也不以 baseline 代替真正比較結果。選中的同一張仍依序在隔離 WASM Worker 跑 Mobile 及 Server，並以當次結果判斷 rescue/regression；每次最多一張、完成後 session 游標前進、不觸及 Test、不儲存個資、不中途改寫正式 OCR。UI 標示「歷史 baseline 疑似錯誤」或「一般／無歷史錯誤證據」。新增 static regression guard，尚未完成 Windows build 或實際執行。

**效能瓶頸仍存在**：單張兩模型約 57.5 秒，排序只能提高測試資訊價值，不會降低單張模型推論成本。不要直接回到連續 19 張模式；未來需另行改善模型初始化／耗時隔離與 Worker 強制中止能力。GitHub Actions 禁止執行，真實證件圖片、姓名、證件號不提交 GitHub。



## 2026-10-12 — Mobile / Server Worker 單張 A/B 首次完整成功；下一張游標

使用者本機完整跑完安全單張的 Validation 護照 Mobile / Server Recognition：比較 1 張，Mobile 中文姓名正確 1、Server 正確 1、救回 0、退步 0、錯誤 0；兩模型合計執行時間 57,455 ms（單張 P50/P90 均此值，不能視為各模型獨立 latency 或完整 Validation 指標）。此前網頁無回應問題此次未再發生。仍無證據表明 Server 比 Mobile 準確。合成字測試仍為 WASM 1 框正確。

在 main 新增 session-only 單張 Validation 護照游標：每次人工按一次才跑一張，完成或計入錯誤後移到下一張，不再永遠重測第一張；重新整理頁面時游標會重置。保留雙 Worker 先後運行、匿名合計、只讀 Validation、不動 Test 與正式 OCR；測試守衛更新。尚未在 Windows build 驗證這項游標變更。下一步先由操作者驗證游標與單張運行穩定性，不要求一次跑 19 張。若要針對剩餘姓名錯誤樣本精準評估，應建立更有效率的基線／候選關聯與隔離測試設計，不能聲稱單張已驗證改善。正式 pipeline `.29`，護照 14/19、台胞證 13/13。禁止 GitHub Actions，不上傳證件個資。


## 2026-10-12 — 護照模型 A/B 主執行緒卡死，先改 Worker＋單張安全驗證

使用者在本機執行 Validation Mobile vs Server Recognition 的19張 A/B，跑到約 2/19 時瀏覽器顯示「網頁無回應」，即使等候也無法恢復。**這次 A/B 不算有效完成，無任何可靠準確率數字**。原因尚未用 profiler 定位；現有 Server WASM 大模型及 Mobile OCR 都在原本瀏覽器執行，可能阻塞主執行緒且造成記憶體壓力。

已直接修正 main：隔離 Server Validation instance 的 PaddleOCR.create 加上 SDK 已支援的 `worker: true`，WASM 繼續單執行緒，保持正式 OCR 不變；實驗 UI 暫時限每次手動只跑 **1 張 Validation 護照**，不允許再一次跑19張。新增 Worker 與樣本上限的 regression guard，仍只顯示匿名總和。不代表整段 pipeline 已搬離主執行緒（Mobile baseline 與 parser 仍在主執行緒）；若單張繼續卡住，立即停止這條 UI 路線，需進一步將整段比較移至 Worker 或服務端隔離環境。這次修改尚未本機 build / runtime 驗證成功；**不得聲稱已解決網頁無回應**。先 pull、verify/build，再點單張安全測試，不需要下載模型或跑32張正式 Validation。禁止 GitHub Actions、真實證件資料上傳 GitHub。


## 2026-10-12 — Server Recognition WASM 合成測試成功，隔離 Validation A/B 候選已建置

使用者瀏覽器已確認：官方 PP-OCRv5 Server Recognition ONNX 在 WebGPU MaxPool ceil_mode 不支援後切換 WASM，成功辨識 1 個合成文字框；輸入「中文姓名 測試甲乙」、輸出完全相同，總耗時 3552ms。此為 SDK / 合成圖相容性成功，不代表護照準確率已改善。

main 接續新增 `createServerRecognitionValidationInstance()`，由 `frontend/src/services/experimentalServerRecognition.ts` 建立獨立 WASM recognition candidate；OCR 品質頁新增「執行護照 Validation 模型 A/B」手動按鈕。只讀取 Validation 分組中的 PASSPORT，對同張影像分別透過現行 `recognizePassportWithPaddle` 及注入候選 instance 的同一護照解析函式運作，匿名統計 Mobile/Server 中文姓名正確、救回、退步、失敗及雙次推論 P50/P90。未進行個別結果持久化，未讀 Test 分組，不更改正式 Mobile pipeline；候選 instance 結束時 dispose，允許安全停止後續樣本。增加 `test-server-recognition-ab.mjs` 靜態守衛並納入 `verify:ocr`。

**本次 A/B 程式碼已提交，但未在使用者 Windows 完整 build 或實際 Validation 跑過**。先執行 `npm.cmd run verify:ocr`、Docker frontend rebuild，再由 OCR 品質頁手動啟動護照 Validation A/B，截圖匿名結果。此比較會多佔記憶體且總耗時較久；數據是同一流程不同 recognition 模型的 end-to-end 比較，而不是完全孤立的 recognition token 比較。若沒有淨改善或明顯回歸，禁止切換正式 OCR。正式 pipeline 仍 .29，基準護照 14/19、台胞證 13/13。禁止 GitHub Actions，不上傳個資及模型二進位。


## 2026-10-12 — Server-rec 合成 WASM 執行成功，但原本 0 框統計讀錯 SDK 欄位

使用者最新合成圖 smoke 截圖顯示：WebGPU MaxPool ceil_mode 不支援後，WASM fallback **成功執行**，總耗時約 2963ms，但 UI 顯示辨識框數 0。檢查發現實驗程式原先讀 `rec_texts/texts`，而現行 PaddleOCR.js 在正式 `paddleOcr.ts` 中的實際使用方式是 `prediction.items`，故該 0 不可靠，不代表 Detection 失敗。已將隔離實驗改用 `prediction.items` 計算框數與擷取合成文字，UI 顯示實際 synthetic 文字（不含真實旅客資料），並補 regression guard。正式 production `.29` 不改；尚未確定合成字辨識正確，也沒有執行真實模型 A/B；下一步只需 pull、verify:ocr、frontend Docker rebuild、重新按合成圖測試，不要再跑 32 張 Validation。禁止 GitHub Actions 與個資上傳。


## 2026-10-12 — Server-rec WASM fallback 未觸發的根因修復

使用者再次回報合成圖 smoke 仍顯示原始 `ceil_mode ... WebGPU MaxPool kernel` 錯誤。追查原始 `experimentalServerRecognition.ts` 發現上次 regex literal 寫成 `[\\s\\S]`（雙重反斜線），無法比對跨字元錯誤訊息，於是 auto/WebGPU 直接 throw，從未進入 WASM retry。現已改用 `message.includes('ceil_mode') && message.includes('WebGPU MaxPool')`，並在 regression 測試用使用者截圖的實際錯誤字串檢查；若 WASM 亦失敗，UI 現在會看到 `Auto/WebGPU ...；WASM fallback 亦失敗：...`，可辨別實際第二階段錯誤。正式 production OCR `.29` 完全不動，沒有讀證件、沒有更動 32 張 Validation。此修復尚待使用者本機編譯／合成圖 smoke 驗證；不得預先宣稱 WASM 已成功。


## 2026-10-12 — Server Recognition 合成 smoke：WebGPU MaxPool ceil_mode 不支援，已加 WASM fallback

使用者在瀏覽器按「執行合成圖模型啟動測試」，顯示 `ceil_mode output-shape is computed, but ceil_mode kernel execution (padding) is not yet implemented in the WebGPU MaxPool kernel`。這表示隔離模型初始化／執行遇到 WebGPU ONNX Runtime kernel 不支援；**不是模型 A/B 準確率結果**。main 已在 `experimentalServerRecognition.ts` 增加限定此錯誤的 fallback：auto 失敗且吻合 WebGPU MaxPool ceil_mode 時，重新用獨立 WASM backend、單執行緒、`/ort-wasm/` 初始化並用同一張 Canvas 合成文字執行；每個成功建立的 instance 都在 finally dispose。其他錯誤不隱藏、不盲目 retry。UI 顯示實際 backend、fallback 與耗時，並新增 static regression guard。正式 production PP-OCRv5 mobile pipeline 2026.10.11.29 未改，尚未在使用者本機測試 WASM 成功。下一次只需 pull、verify、frontend Docker rebuild、按合成圖測試；**不要跑 32 張 Validation**。禁止 GitHub Actions、個資和模型二進位上傳。


## 2026-10-12 — 官方 Server Recognition 隔離合成圖啟動測試已建置

在官方 PaddlePaddle 發布的 PP-OCRv5_server_rec_onnx（約 84.5MB ONNX + inference.yml）基礎上，已新增一次性可選下載與 SHA256 校驗腳本、streaming tar 封裝工具及本機 manifest。執行 `cd frontend && npm.cmd run prepare:ocr-server-model` 可在本機下載及產生同源 /paddle-models/experiments/ 資產，二進位檔由 .gitignore 排除、不上傳 GitHub。候選模型來源、限制及精確步驟見 docs/OCR_MODEL_AB_PLAN.md。

OCR 品質頁面已新增完全隔離的「執行合成圖模型啟動測試」，呼叫獨立 PaddleOCR SDK instance、以 Canvas 自製假中文字測試圖驗證瀏覽器模型是否可初始化推論、結束後 dispose。此實驗僅操作者主動執行，不讀真實證件，不呼叫 production getPaddle，也不代表真實姓名準確率會改善。已新增 static/synthetic regression guard 並接入 verify:ocr。

目前候選尚未於使用者 Windows 實際下載或完成合成 smoke；原 production pipeline 2026.10.11.29 完全不變，正式最佳已實測護照 14/19、台胞證 13/13。下一驗收先看 npm.cmd run verify:ocr、Docker frontend rebuild、合成 smoke 是否成功，**不要求立即跑固定 32 張 Validation**。只有獨立模型可確定載入且比較設計完成，才進入真正 A/B。禁止 GitHub Actions；不得上傳模型二進位或護照個資。


## 2026-10-12 — 模型 A/B 準備重大更新：官方 server-rec ONNX 已找到

已在 PaddlePaddle 官方 Hugging Face 頁面找到 PP-OCRv5_server_rec_onnx，含 inference.onnx (約 84.5MB) 與 inference.yml，Apache-2.0。來源：https://huggingface.co/PaddlePaddle/PP-OCRv5_server_rec_onnx/tree/main。原先所稱「需要自行轉 ONNX」已不再成立。新增本地打包工具 frontend/scripts/package-ocr-server-model.mjs、synthetic regression test 與 verify:ocr 入口，能將本機下載的官方檔案串流封裝為 SDK 所需 uncompressed tar，並透過既有 inspector 驗證結構與 model_name。詳見 docs/OCR_MODEL_AB_PLAN.md。

正式 PP-OCRv5 mobile OCR pipeline 仍為 2026.10.11.29，已實測護照 14/19、台胞證 13/13。尚未真的下載、實際封裝或瀏覽器初始化 server-rec ONNX，也未做模型 A/B。接下來應完成候選模型相容性及隔離測試，再要求一次有意義的本機驗證。不得上傳模型二進位、任何真實證件影像或個資，不得執行 GitHub Actions。


## 2026-10-12 — .29 驗證持平；已啟動模型級 A/B 前置研究

使用者完成 `2026.10.11.29` 固定 32 張 auto Validation：護照中文姓名及整張全欄 **14/19（74%）**，台胞證全欄及必要欄位 **13/13（100%）**，完成 32 張、失敗 0。與 `.28` 持平，`.29` Canvas 高品質插值**沒有可見淨改善**，不得再以調 interpolation 設定作下一輪推進。

停止無效的 ROI/拼音規則/縮放小參數迴圈。新的主要技術方向為「保持現有 PP-OCRv5 mobile detection 與 parser/selector，另以 PP-OCRv5 server recognition 作 read-only A/B」，詳見 [OCR_MODEL_AB_PLAN.md](./OCR_MODEL_AB_PLAN.md)。官方 benchmark server-rec 繁體中文指標較高，但不證明台灣護照會更準；SDK 自訂模型須合法、相容的 uncompressed tar + inference.onnx + inference.yml。新增 `frontend/scripts/inspect-ocr-model-tar.mjs` 和合成 `test-ocr-model-tar-preflight.mjs`，後者接入 `verify:ocr`。

**尚未取得並驗證 browser-compatible server-rec ONNX tar，也尚未實作可執行的新模型推論 A/B；正式 pipeline 仍是 `.29`，不可現在要求使用者跑固定 32 張。** 模型資料與證件照片不得上傳 GitHub；GitHub Actions 禁止執行。固定 legacy Validation 缺當初真實 OCR 工作圖像，不可宣稱 production 泛化準確率。


## 2026-10-12 — .29 護照姓名 OCR 裁切高品質插值候選（待本機驗證）

正式最新已實測 .28 固定 Validation：32/32 完成，護照中文姓名及整張全欄 14/19（74%）、台胞證五欄及整張 13/13（100%）。護照餘下 5 張姓名錯誤，4 張沒有完整正確辨識候選，先前額外 focused VIZ ROI 已在 .27 證明無收益並於 .28 撤除。

main 新候選 2026.10.11.29 不增加任何 OCR 推論／裁切，不變更原本 name-field 及 broad VIZ 比例、不放寬姓名 selector；只對**護照既有兩個姓名 crop 且確實放大時**，在 Canvas 明確啟用 `imageSmoothingEnabled=true`、`imageSmoothingQuality='high'`。共享 `createPixelCrop()` 新增預設為 false 的選用參數，因此台胞證等其他 crop 維持原行為。這只是測試高品質插值能否幫助小字 recognition 的候選，瀏覽器實際實作可能不保證改善。新增 `test-passport-resize-quality.mjs` regression，鎖定只對護照的 opt-in、無額外 focused ROI，加入 `verify:ocr`；既有 OCR 版本測試同步更新。

此候選尚未在 Windows 執行完整 `npm.cmd run verify:ocr`、Docker rebuild 或固定 32 張 Validation；不可宣稱比 .28 改善。若沒有提升或造成退步，應回退此項插值實驗，不再以這條路徑調參。台胞證 BOCA、joined-token、one-syllable、standalone sex、focused retry 全保留。禁止 GitHub Actions，不開小型 branch/PR，不上傳證件影像或真實個資；legacy Validation 缺實際工作輸入影像，不代表新照片泛化準確率。


## 2026-10-12 — .28 正式固定 Validation：移除 focused VIZ 後無回歸

使用者本機完成 2026.10.11.28 固定 auto Validation，完成 32/32、失敗 0。護照整張及中文姓名 14/19（74%），其餘七欄 19/19；台胞證整張及五個必要欄位 13/13（100%）。相比 .27 無變化，證實撤回無收益的第三次 focused VIZ 沒造成固定樣本回歸。護照五張姓名失敗中，完整正確候選 1 張（name-field / romanization:one-syllable-mismatch）、其他候選不符 4 張。focused VIZ 診斷正確候選 0、未執行 5，符合該 OCR 已撤除。嚴格 one-syllable shadow 潛在改善 0、退步 0。護照 OCR 中位數約 1.2 秒、P90 2.3 秒，台胞證 OCR 中位數約 0.5 秒、P90 2.7 秒。

結論：最佳已實測版本更新為 .28（準確率仍護照 14/19、台胞證 13/13）；不得恢復第三段 fixed focused ROI 或錯誤聲稱帶來提升。下一階段應探索真正 recognition-quality 改進，並保持既有姓名 selector 不變。32 張 legacy Validation 缺原始 OCR 工作輸入照片，不代表新照片泛化準確率。禁止 GitHub Actions，不提交個資。


## 2026-10-12 — .28 撤回無效 focused VIZ（待本機驗證）

.27 本機固定 32 張 Validation 全部完成，失敗 0。護照中文姓名與整張 14/19，台胞證全欄 13/13。新增 focused VIZ 在五張錯誤護照裡正確候選 0、其他候選 1、未執行 4，沒有提升準確率。因此不再疊加第三次 OCR。

main 的候選版本更新為 2026.10.11.28，撤除 focused VIZ 的額外辨識與建立裁切；保留先前已有實際改善的 name-field 和 broad VIZ 路徑、既有姓名 selector，以及所有已成功的台胞證姓名和 sex 路徑。測試守衛更新為確認 focused crop 不會恢復。這是減少無益的額外運算，不宣稱提高準確率。

目前尚待 Windows npm.cmd run verify:ocr 和 Docker rebuild。最新實測仍為護照 14/19、台胞證 13/13；此固定 legacy Validation 不包含當初原始 OCR 工作輸入影像，不代表新照片泛化。GitHub Actions 禁止執行，不上傳真實證件個資。



## 2026-10-12 — .27 第二個 TypeScript build blocker

Windows Docker rebuild 仍因 TS2322 停在 `src/components/PaddleBaseline.vue(512,7)`；其實際型別來源是 `frontend/src/models/passportReview.ts` 中的 `PassportReviewOcrMetadata.chineseNameSource`，先前只允許 `name-field | viz-crop | null`，未包含 `focused-viz`。已擴充此共享 model 聯集，並將驗證守衛加到 `test-passport-focused-viz.mjs`。不需修改 Vue 元件、OCR 演算法或 pipeline 版號（維持 2026.10.11.27）。本次只是 TS 型別編譯修復，尚未在使用者 Windows 本機確認 build 成功，需先 `npm.cmd run verify:ocr`，成功後才 Docker rebuild 與固定 32 張 Validation。不得執行 GitHub Actions 或上傳證件個資。

## 2026-10-12 — .27 TypeScript build blocker 修復（等待本機驗證）

使用者 Docker frontend rebuild 在 `RUN npm run build` 因 TS2322 / TS2345 停止，原因是新增 `focused-viz` 後未同步擴充 `PaddleBaselineResult.chineseNameSource` 聯集，以及 Validation `aggregatePassportCropDiagnostics().count` 的 `focusedViz` key 聯集。已在 main 直接修復這兩處型別，並在 `test-passport-focused-viz.mjs` 加上 source guard。未改 OCR selector、裁切參數、任何台胞證路徑或 pipeline 版本（仍為 `2026.10.11.27`）。此為編譯 blocker 修復，尚未本機跑完整 `verify:ocr`／Docker rebuild／32 張 Validation；不得聲稱 build 已通過或精準率改善。上次 Docker build 失敗，未產生新的 frontend image。下一步集中本機驗證。禁止 GitHub Actions；不得提交證件個資。


## 2026-10-12 — .27 護照 focused VIZ 候選（待本機驗證）

.26 正式固定 Validation 32/32 成功，護照姓名與全欄 14/19，台胞證全欄 13/13。剩下五張護照姓名錯誤中四張沒有完整正確 OCR 候選；.25/.26 嚴格 one-syllable shadow rescued 0，故不再放寬正式 selector。

候選 `2026.10.11.27` 新增護照 `focused-viz` 裁切，範圍沿用現有 broad VIZ 左上邊界 (x=24%、y=12%)、縮至寬 60%、高 34%，使用已有的 bounded `createPixelCrop(...,1500)`。僅在既有 `name-field`、`viz-crop` 都未得到明確 romanization compatible 姓名時，才額外做一次 focused ROI OCR；已有 compatible 的護照不增加 OCR 次數。新候選仍經過既有嚴格 `chooseTaiwanChineseName`，只允許明確 compatible 候選取代保留的 provisional 值；沒有 compatible 時維持原有姓名、不猜。台胞證所有 selector/sex retry 完全不動。Validation 增加 focused VIZ 的匿名 exact/other/none/not-run 數量；新增 synthetic source regression `test-passport-focused-viz.mjs` 並納入 `verify:ocr`。

**尚未跑本機 verify/build 或固定 32 張 Validation，不能宣稱任何改善**。正式最佳已實測仍是 .26 護照 14/19、台胞證 13/13；集中本機驗證後對照新增 focused ROI 命中與總準確率，不成功就不繼續盲目疊加 crop。全部 32 張為缺原始 OCR 工作圖的 legacy Validation，不代表新上傳照片泛化準確率。禁止 GitHub Actions、branch/PR 微改與任何真實證件／個資上傳。


## 2026-10-12 — .26 固定 Validation 實測

使用者完成 pipeline 2026.10.11.26 的固定 32 張 auto Validation，32/32 成功、失敗 0。護照中文姓名及整張全欄 14/19（74%），其他七欄 19/19；台胞證五項必要欄位與整張全欄 13/13（100%）。相較 .25 無改善亦無回歸。嚴格 one-syllable shadow：潛在改善 0、潛在退步 0、維持正確 14、維持錯誤 5；existing-accepted 9、eligible 6、ambiguous 3、wrong-subtype 1。這些 eligible 不是實際正確率，不得將 shadow 政策直接用於正式 selector。剩餘五張護照姓名錯誤：一張具有完整正確候選，被 name-field / romanization:one-syllable-mismatch 擋住；其餘四張沒有完整正確候選。下一步優先改善原有 OCR 文字辨識品質，不再只放寬 selector。此為缺原始 OCR 工作圖的 legacy Validation，不能代表新照片泛化。禁止 GitHub Actions，不上傳證件個資。


## 2026-10-12 — .26 護照 Shadow 最終決策模擬修正（待本機驗證）

.25 固定 Validation：護照全欄／中文姓名 14/19，台胞證全欄 13/13；嚴格單音節 shadow rescued 0、regressed 0、unchanged-correct 14、unchanged-wrong 5；eligible 6、existing-accepted 9、ambiguous 3、wrong-subtype 1。**eligible 非準確率，.25 不可直接提升成正式 selector。**

.26 將 read-only shadow 的不同 ROI 候選合併規則獨立為 `passportShadowMerge.ts`：只要正式姓名已存在，shadow 不能覆寫；無正式姓名且多 ROI 提出不同名字，視為 ambiguous 並拒絕；若所有 ROI 都一致且沒有正式姓名，才產生模擬候選；完全無候選則保留空值。這項修正用於避免舊的「拿第一個 shadow 名稱」模擬與實際策略不一致；**仍不將 shadow 寫進 production OCR 結果**，也不增加任何 OCR 呼叫。新增 `test-passport-shadow-merge.mjs`：synthetic 測試覆蓋已接受姓名保護、多 ROI 相同／不同、無候選及 null input，接入 `verify:ocr`，版本更新為 `2026.10.11.26`。

.26 尚未跑 Windows verify/build 或 32 張固定 Validation。正式最佳已實測準確率仍是護照 14/19、台胞證 13/13；Validation 只核對匿名最終 shadow 統計是否更可信，不能宣稱準確率提高。禁止 GitHub Actions、不新開 branch/PR、不提交真實證件照片或 OCR 個資。固定 legacy Validation 缺少 OCR 原始工作輸入影像。


> 此文件是給下一個 ChatGPT 對話直接接手用的。
> **不要重新設計系統、不要重新跑過去已證明失敗的 OCR 嘗試、不要重新啟用 GitHub Actions。**

## 2026-10-12 — .20 正式 Validation：台胞證全欄 13/13

2026.10.11.20 固定 auto Validation 32/32 完成、失敗 0。護照全欄和中文姓名 13/19，其餘七欄 19/19；台胞證全欄、中文姓名、出生日期、性別、證件號碼、有效期限全部 13/13。相較 .19，台胞證性別與全欄各新增 1 張正確，護照未退步。Focused sex retry 匿名診斷：started 1、label ROI 1、fixed ROI 0、detected text 1、candidate 1、conflict 0、applied 1、still empty 0。standalone-token 仍補回 2 張，姓名 selector 維持 13/13。此為 legacy 固定照片 Validation，32 張皆缺當時 OCR 工作輸入圖，不代表對新照片泛化達 100%。正式最佳實測為 .20；下一主要目標護照中文姓名 13/19。禁止 GitHub Actions，保留成功台胞證路徑。

## 0. 過往候選階段：`.20` 已實作，下一步只需集中本機驗證

main 已完成 focused sex retry `2026.10.11.20` 候選：只對 `sex === ''` 的台胞證做一次小 ROI OCR；label geometry 優先，沒有 label 才 fixed-layout crop；只接受男/女/M/F 或同列 Sex/性別語意，衝突維持 empty。匿名 retry diagnostics 與 regression tests 已接入 `verify:ocr`。

**尚未有 `.20` 真實 Validation 結果。** 最佳已實測仍是 `.19`：護照 13/19、台胞證全欄 12/13、姓名 13/13、sex 12/13。下一步不要再改程式，先在 Windows 本機跑 `npm.cmd run verify:ocr`、Docker frontend rebuild、確認頁面 `.20`，再跑 32 張 auto Validation，將結果寫回文件。

## 1. Repository / current state

Repository：

`YI-CHENLIN1204/passport-scanner-v2`

目前正式最佳實測 OCR pipeline：`2026.10.11.20`，台胞證全欄 13/13，護照 13/19。

目前沒有 open PR。近期已改成**直接在 main 集中開發、集中驗證**，不要再為每個小修改開 branch / PR。

GitHub Actions 已刻意改成 `workflow_dispatch only`。

**禁止執行 GitHub Actions，包括手動 workflow。** 2026-10-11 月額度已接近用完，使用者明確要求不要再浪費 Actions minutes。

## 2. 專案定位

這是旅行社內部使用的「證件掃描／旅客資料建立系統」。

現階段不是 ERP、CRM、客戶端自助系統，也不是完整出團管理。

目前流程：

`建立團別 → 設定需要的證件 → 批次上傳照片 → 瀏覽器端 OCR → 自動建立／合併旅客 → 人工審核 → 形成可靠旅客與證件資料 → CSV 匯出`

OCR 現在完全在瀏覽器端執行，主要為 PaddleOCR.js / PP-OCRv5。

## 3. 絕對限制

1. 不把真實護照、台胞證、身分證照片或個資上傳 GitHub。
2. 不上傳姓名、證件號、sample id 等可識別資料。
3. Validation diagnostics 僅能保存匿名 aggregate counts。
4. 不使用雲端圖片辨識 API。
5. 保留人工審核，OCR 不是最終真值。
6. 正式照片保存規則仍為回國日 + 7 天；不要因 OCR 實驗更改 production retention。
7. 不修改固定 Validation ground truth 來讓數字變漂亮。
8. 不再用 GitHub Actions。
9. 不要再為每個小修改開 branch / PR；此 repo 目前只有使用者自己開發。
10. 不要為每個小修改就要求使用者重跑 32 張；集中一批有意義的修改後再跑一次。

## 4. 本機環境

Windows + VS Code。

Project：`C:\Users\User\Desktop\passport-scanner-v2`

PowerShell 的 `npm` 會受 ExecutionPolicy 影響，因此一律使用 `npm.cmd`。

集中 regression/build：

```powershell
cd C:\Users\User\Desktop\passport-scanner-v2
git pull origin main

cd frontend
npm.cmd run verify:ocr

cd ..
docker compose up -d --no-deps --build frontend
```

之後瀏覽器 Ctrl+F5，確認頁面顯示正確 OCR pipeline 版本，再跑 32 張固定 auto Validation。

## 5. 固定 Validation 的限制

目前 legacy Validation 共 32 張：護照 19、台胞證 13、身分證 0。

重要限制：

- 32/32 都缺少當時真正 OCR work-input image。
- Validation 是用保存的人工審核影像重跑，只能做版本回歸比較。
- 不能把這個數字宣稱為完整真實 production accuracy。
- 樣本可能有同一旅客多張。
- 真實 end-to-end 新照片泛化仍要另外評估。

## 6. 目前正式最佳實測：`.19`

2026-10-12 使用者完成 `2026.10.11.19` auto Validation。

### 護照（n=19）

- 整張全欄正確：**13/19 = 68%**
- 中文姓名：**68%**
- 英文姓名：100%
- 出生日期：100%
- 性別：100%
- 國籍：100%
- 證件號碼：100%
- 簽發國：100%
- 有效期限：100%

護照目前唯一主要問題仍為中文姓名 13/19。

### 台胞證（n=13）

- 整張全欄正確：**12/13 = 92%**
- 中文姓名：**13/13 = 100%**
- 出生日期：100%
- 性別：**12/13 = 92%**
- 證件號碼：100%
- 有效期限：100%

目前台胞證只剩 **1 張 sex 錯 / empty**。

## 7. 台胞證中文姓名：已完成，先鎖住

不要再改目前姓名 selector，除非新資料證明有回歸。

### `.10` ~ `.14`

多次沒有提升。已證明：

- 8 張錯誤姓名中，8/8 正確姓名完整存在 OCR raw row。
- 不是 Detection / Recognition 根本看不到姓名。
- row-index distance 不可靠：8 個 short/exact conflict 候選距離 Latin row 全部 >=5。
- 不要再做 row-distance fallback。

### `.15` BOCA official romanization

加入 BOCA / 台灣官方舊式拼音 variant：台胞證姓名 5/13 → **9/13**，全欄 4/13 → **7/13**。official promotion 4 張、實際採用 4 張。有效，必須保留。

### `.16` exact joined-token segmentation

解決英文拼音 OCR 黏在一起。只有每個中文字都能以 Hanyu/common/BOCA alias 精確消耗整個 Latin string 才通過，不做 fuzzy。

結果：中文姓名 9/13 → **11/13**，全欄 7/13 → **9/13**。joined-token promotion 2 張、實際採用 2 張。有效，必須保留。

### `.17` unique one-syllable fallback

只有 compatible / anchored unknown 都沒有，且只有唯一一個 2–4 字完整獨立 raw row，subtype = one-syllable-mismatch 時才採用。

結果：中文姓名 11/13 → **13/13**，全欄 9/13 → **10/13**。有效，必須保留。

## 8. 台胞證 sex：目前進度

### `.18`

原假設：MRZ sex 可能壓過正確 visual sex。

檢查 MRZ code 發現 sex 字元確實不受 composite checksum 驗證，因此 `.18` 加入 same-row semantic sex。

但真實 Validation 顯示：MRZ 有 sex 0；geometry labeled sex 10；same-row semantic 3；semantic-row override 0；final empty 3。

所以 **MRZ override 假設被否定**。不要再往 MRZ priority 調。

### `.19`

加入非常保守的 standalone token fallback：只有 OCR detection box 整個文字恰好是 `男`、`女`、`M` 或 `F` 才算；如果同張同時出現 M 與 F，拒絕。

selector 優先序：`visual-agreement > semantic-row > MRZ > label > semantic > standalone-token > empty`。

真實 Validation：standalone token 可用 12 張；token M/F conflict 0；standalone-token 實際補回 **2 張**；final empty **1 張**；sex 10/13 → **12/13**；台胞證整張 10/13 → **12/13**。

所以 standalone-token 路徑有效，必須保留。

## 9. 下一個唯一優先工作：`.20` focused sex retry

現在不要再改 selector。

最後 1 張的問題已變成：`OCR detection / recognition 沒有產生任何 sex evidence`。

下一步直接做 focused sex retry：

1. 只有 `finalSex === ''` 的台胞證才啟動 retry。
2. 不要讓已經正確的 12 張增加額外 OCR。
3. 若 geometry 有 Sex / 性別 label，依 label 位置做窄 ROI crop。
4. 若 label 也沒抓到，再使用台胞證正面固定版面附近的 conservative sex region crop。
5. 對 ROI 重新 OCR。
6. 只接受 standalone `男/女/M/F` 或同列 `性別男/女` / `Sex M/F`。
7. ROI 若同時有 M/F 或其他歧義，維持 empty，不猜。
8. 新增匿名 diagnostics：retryStarted、retryDetectedText、retryCandidateFound、retryApplied、retryStillEmpty。
9. 新增 synthetic / wiring tests。
10. pipeline bump 到 `2026.10.11.20`。
11. 一批完成後才請使用者跑 `npm.cmd run verify:ocr` + Docker rebuild + 32 張 Validation。

**目標：台胞證 sex 13/13、整張 13/13，同時中文姓名維持 13/13、護照維持至少 13/19。**

## 10. `.20` 之後的優先順序

如果 `.20` 把台胞證固定 Validation 推到 13/13，下一個主要瓶頸改成：`護照中文姓名 13/19 = 68%`。

護照現有匿名診斷顯示：中文姓名錯誤 6 張；候選文字完整吻合 1 張；原始 OCR 行完整吻合 0 張；僅較長 OCR 文字中出現姓名 0 張；其他候選內容不符 5 張；romanization one-syllable-mismatch shadow 1 張；外交部護照拼音對照候選沒有顯示可直接提升。

因此護照不能直接照抄台胞證 raw-row selector；需要另外研究 passport Chinese-name ROI / recognition。

## 11. 重要檔案

- `frontend/src/services/paddleOcr.ts`
- `frontend/src/services/permitRawNameEvidence.ts`
- `frontend/src/services/permitRawNameRomanization.ts`
- `frontend/src/services/nameRomanization.ts`
- `frontend/src/services/officialRomanizationVariants.ts`
- `frontend/src/services/permitFieldEvidence.ts`
- `frontend/src/services/permitSexSemantics.ts`
- `frontend/src/services/permitStandaloneSexEvidence.ts`
- `frontend/src/services/permitSexDiagnostics.ts`
- `frontend/src/views/OcrQualityPage.vue`
- `frontend/package.json`
- `frontend/scripts/`

集中 regression：`npm.cmd run verify:ocr`。

## 12. 權威文件

下一個對話優先讀：

1. `docs/HANDOFF.md`
2. `docs/NEXT_CHAT_HANDOFF.md`
3. `docs/WORKLOG.md`
4. `docs/OCR_OPEN_SOURCE_REVIEW.md`
5. `docs/DECISIONS.md`
6. `AGENTS.md`

`docs/WORKLOG.md` 為 append-only。

## 13. 工作方式

使用者已多次明確要求：

- 進度要快。
- 不要做一步就停下來。
- 不要每個小修改就叫使用者測。
- 不要每個小修改開 branch / PR。
- 要「集中開發 → 集中 regression → 一次 Validation」。
- 每次真實 Validation 結果要寫回 GitHub 文件。
- 要保留成功與失敗實驗，避免下一個對話走回頭路。
- 目標是快速提高真正 OCR 精準度，不是累積大量無意義測試。

下一個對話應照此方式直接繼續。

## 2026-10-12 — 單張 A/B 仍卡在 1/1：修正 Mobile 主執行緒遺漏

使用者已更新先前 Worker／單張安全模式，但畫面仍停在「護照 Validation 1/1」，沒有完成比較。進一步查碼確認上一版只有 Server instance 使用 `worker: true`；Mobile 比較基準仍是 `recognizePassportWithPaddle(file)`，依賴 production 主執行緒 SDK。這是單張仍可能卡住的重要架構缺口，尚不能斷定唯一成因。

本批已修正 OCR 品質頁的 Validation-only A/B：Mobile 改由 `createValidationPaddleInstance(true)` 獨立 WASM Worker 執行，取得結果後先 dispose、釋放資源，再初始化 Server 的 WASM Worker、執行同一張照片，最後 dispose。避免兩組大型模型同時佔用記憶體；正式 production OCR 完全不變。新增啟動 Mobile、推論 Mobile、釋放 Mobile、啟動 Server、推論 Server、釋放 Server 逐階段提示，更新 regression guard。單張限制仍保留，不執行 19 張或 Test cohort，不持久化姓名與 OCR 原文。

**修正尚未經 Windows build 或瀏覽器 runtime 證實。** 若再次無回應，應停止同種主頁推論測試，改設計完全可中止的隔離工作流程；目前停止按鈕只能停止後續樣本，不能強制終止目前同步卡住的 OCR。基線仍 `.29` 護照 14/19、台胞證 13/13；GitHub Actions 禁止執行。

## 2026-10-12 — Server-rec 單張 A/B 實測與歷史 baseline 覆蓋稽核

使用者完成一張 Validation 護照的雙 Worker 對照：Mobile 正確 1/1、Server 正確 1/1、救回 0、退步 0、錯誤 0。Mobile 含初始化與釋放 8,589ms，Server 含初始化與釋放 47,208ms，兩模型合計 55,796ms；這不是純辨識延遲。UI 顯示樣本 1/19「一般／無歷史錯誤證據」，因此目前的歷史 baseline 優先排序沒有證明能選中最新版 .29 的錯誤護照；不得聲稱 Server 準確率提升。

為避免再次昂貴盲測，已在 OCR 品質頁新增可手動執行的「先檢查匿名歷史基準覆蓋率（不執行 OCR）」：只檢查 Validation 護照人工答案與已存 evaluationBaselineJson，匿名統計有 baseline、歷史姓名錯誤、歷史姓名正確、無 baseline、無人工姓名答案的件數，不載入圖片、不跑任何 OCR、不存個資；並更新回歸守衛。需在本機 verify/build 後先執行此稽核，據結果決定下一步，不要直接重跑 19 張或盲測 Server。Production pipeline `.29` 不變，GitHub Actions 禁止執行。

## 2026-10-12 — 限定已驗證錯誤護照的單張 Server A/B

歷史 Validation 護照 19 張可解析 baseline 為 0，故不能用歷史錯誤排序。更新 main：未在同一頁完整完成 production Validation 時，模型 A/B 按鈕停用；成功且沒有 OCR 失敗時，僅用本頁記憶體中的姓名判錯樣本 key 集合輪流進行單張 A/B。索引不持久化，刷新頁面即失效。不再盲測原本正確的護照。沿用獨立 Mobile/Server WASM Worker，正式 OCR pipeline .29 不變。已更新靜態守衛，尚待本機 verify/build。禁止 GitHub Actions 與真實個資上傳。

## 2026-10-12 — .29 Validation 錯誤索引成功，Server A/B 第一張無救回

使用者本機正式 auto Validation 完成 32/32：護照中文姓名及整張 14/19（74%），台胞證整張 13/13（100%），失敗 0；當頁建立 5 張護照姓名錯誤的 session-only 索引。隔離 Worker A/B 正確選中第一張錯誤護照（1/5）；Mobile 中文姓名 0/1、Server 0/1、救回 0、退步 0、錯誤 0。Mobile 含初始化／釋放 11,402ms，Server 63,145ms，總 P50/P90 74,547ms；每個時間是全流程開銷，不是純 recognition latency。此一筆不能推論其餘四張是否可救回，也不能升級正式模型。候選模型目前 WASM 耗時偏高；應保留安全單張模式並研究更有效率的 recognition-only 對照，不再做盲目全樣本連續運算。當頁索引刷新會消失，不保存姓名或證件資訊。正式 .29 未修改。禁止 GitHub Actions 和上傳個資。

## 2026-10-12 — 已驗證錯誤護照改用 Server-only 救援實驗（待本機測試）

先前本頁正式 `.29` auto Validation 完成 32/32，護照 14/19、台胞證 13/13，建立 5 張護照姓名錯誤的暫存索引；第一張雙模型 A/B Mobile 和 Server 均錯，救回 0。Mobile 含啟動釋放 11,402ms、Server 63,145ms，雙模型 74,547ms。

本批只改研究實驗：由於同頁正式 Validation 已驗證所挑選的護照姓名錯誤，因此不再在昂貴的救援試驗中重複初始化 Mobile Worker；只執行 Server WASM Worker 並與同頁 `.29` 判錯及人工 ground truth 比對。每次仍只跑一張已驗證失敗的 Validation 護照，若 Server 正確則計候選救回。UI 明確標示此為「正式 auto 已判錯 vs Server WASM」的跨 backend 對照，不能等同兩模型在同一 backend 同時重跑的嚴格 A/B。安全索引同頁暫存、刷新消失；模型和文件照片不提交 GitHub。正式 OCR pipeline `.29`、台胞證、固定 Test 完全不變。已更新 synthetic/static regression guard，尚未 Windows verify/build 或實測；Server 耗時瓶頸仍需另行研究。禁止 GitHub Actions。


2026-10-13: v6 Small offline experiment now reports aggregate bounding-box availability, recognition score >=0.75, and upper-ROI evidence for standalone exact candidates, especially within the four verified .29 candidate-miss passports. These checks are exploratory and do not change production OCR or establish end-to-end recovery. Historical 1/4 confirmed candidate rescue remains the latest result. No private data committed; no Actions.

## 2026-10-16 — 最新 OCR 模型決策與下一步
先讀 docs/OCR_CURRENT_STRATEGY.md 及 docs/DECISIONS.md D-089 / D-090，避免重複失敗實驗。正式 .29：護照 14/19、台胞證 13/13。PP-OCRv6 Small 另辨出一張正確姓名候選，但同樣本正式 MRZ gate 0 rescue、2 wrong；不能正式採用。OCR 品質頁已將 Server、Tesseract、ROI A/B 四組舊按鈕隱藏，保留正式 Validation、樣本品質及本機錯誤索引。當前目標：五張錯誤護照匿名根因歸類／樣本品質診斷；所有模型與工程決定必須更新文件。main 集中開發、不啟動 Actions、不提交私人資料。文件記錄提交本身不代表提升了辨識率。

## 2026-10-16 — Root-cause evidence before swapping OCR models
在正式 OCR 品質頁錯誤索引區新增匿名多 crop 失敗證據彙總。注意『所有已跑區域沒有候選』與『有其他候選』不是 detector/recognizer 真正因果分類，不能作為重新訓練結論；需先測 Build / Validation。後續利用此分類選擇品質問題或候選生成改善。D-091 與 docs/OCR_CURRENT_STRATEGY.md 為決策入口。正式 .29 仍護照 14/19、台胞證 13/13；不開 Actions、不上傳私密影像。

## 2026-10-16 — 現行批次掃描人工覆核安全提示
批次護照 OCR 若中文姓名輸出空白，檔案結果列明示需要人工核對，仍正常加入待審核。錯誤但非空白仍須人工驗證；不宣稱提高辨識率。待 Windows build。繼續以真實 5 張錯誤的影像/標註品質和新候選辨識能力作為下一個實質準確率突破口；保留 D-089 至 D-092 決策與 WORKLOG，禁止 GitHub Actions 和私人證件提交。

## 2026-10-16 — 三框護照姓名候選 fallback（待本機測試）
最新 main 增加 PP-OCRv5 Mobile 三個各單漢字高信心、同行近距離、姓名標籤或拉丁姓名錨點、完整正式 MRZ 相容的唯一組合 fallback。只在 direct 已無有效候選才用，不改模型、台胞證、DB，不採錯選的 v6 規則。檢查 npm run verify:ocr / npm run build，再集中 Validation 32 張；在測試前正式成績仍 14/19、13/13。決策 D-093；持續遵守集中 main、不開 Actions、資料不外流。

## 2026-10-16 — Passport failed-name character coverage instrumentation
最新 main 在 OcrQualityPage 正式 Validation 完成時顯示姓名 raw OCR 逐字覆蓋（全部／部分／零），只統計錯誤護照、不顯示個資。這是下一輪決定跨框組字或新繁體辨識模型的根因觀察，不是新 OCR 變更；若只有某些字出現在其他區域仍可能假陽性。需 Windows build 和 full Validation 才有實測分類，不得聲稱準確率提升。維持 D-089–094、WORKLOG、OCR_CURRENT_STRATEGY 同步管理。

## 2026-10-16 — Current experimental OCR candidate change D-095
三框 fallback 已擴充每框 1–2 字、最終 3–4 字，保留 >=0.88、同列、姓名錨點、MRZ compatible、唯一候選以及 direct 優先。尚未 Windows 驗收、未有任何準確率提升證據。記錄在 DECISIONS D-095、WORKLOG、OCR_MODEL_AB_PLAN。正式 .29 14/19、台胞證 13/13，main 集中開發，不啟動 Actions。

## 2026-10-16 — D-096 verified non-improvement
最新固定正式 Validation 32/32：護照 14/19、台胞證 13/13；三框混合 3–4 字 fallback（D-095）無增益。停止組框／拼音閘門小步盲調；下一步投入離線繁體中文 recognizer 或影像品質的具體實驗。不要重新要求相同驗證，先完成有可測結果的新開發；每項決策依 DECISIONS 與 WORKLOG 紀錄，不開 Actions，不提交私密圖檔。

## 2026-10-16 — Alternative traditional recognizer experiment queued
最新 main 在 private ZIP offline PP-OCRv6 benchmark 新增 --rec-model v4-traditional，以固定 v6 detector、同 ROI 評估 RapidOCR 官方 PP-OCRv4 繁體中文 mobile recognition。預設 v6-small 原結果不變；新模型尚未 Windows 實測，首次可能下載模型，不可稱提高正式準確率。需比較 19 張 standalone_exact、四張確認缺候選的 candidate rescue、錯選與耗時，模型取捨與回滾 D-097。不得上傳私人圖檔、不動正式 .29 或台胞證，不啟動 Actions。

## 2026-10-16 — 繁體辨識模型實測更正
本機 19 張護照 benchmark：獨立模型完整正確姓名 6 張，原本正式 .29 四張缺完整候選中有 2 張新增正確候選，但盲選仍有錯選，不能自動採用。實際載入模型為 chinese_cht_PP-OCRv3_rec_mobile.onnx；參數 v4-traditional 不代表 v4 模型權重。暫限人工覆核候選研究，正式基準 14/19、13/13 不變。參照 D-098。

## 2026-10-16 — Source-detail passport retry after blank name
批次掃描新加可控高解析度原圖二次 OCR，只限護照縮圖後 nameZh 空白、<=12MP/<=4200px 且第一次 MRZ 有證號；採用需第二次非空中文姓名和 MRZ 姓名、生日、證號完全相等。儲存真正採用的 OCR input，payload 記錄 attempted/accepted。需 Windows npm build 與實際用戶流程驗收；不改 .29 selector、不動台胞證及 ID、無 Actions。Decision D-099；此法不解決非空但錯字姓名。

## 2026-10-16 — D-100 original-resolution retry evidence consistency
使用者確認 Docker Build 成功。原圖重試採納條件新增性別／國籍／簽發國／效期 MRZ 完全一致，採納後保存正確 OCR input 的 resized/size 紀錄。只影響護照姓名空白且圖片確實被縮小的批次掃描；待 npm verify:ocr 和真實樣本覆核。不得稱正式辨識率已增加。決策 D-099/D-100，不能觸發 Actions 或外流照片。

## 2026-10-16 — D-101 source detail retry visible in batch
批次護照檔案列現在顯示原圖補救是否接受，補救成功也仍須人工核對；元資料由私有 ocrPayloadJson.sourceDetailRetry 解析，不顯示姓名或 MRZ。這是 QA 可觀測性，非提升 OCR 14/19。保持 D-099/D-100 MRZ 嚴格一致性及真正使用的 OCR 圖片來源。尚待本機 npm verify:ocr，禁止 GitHub Actions。

## 2026-10-16 — Fix legacy permit sex assertions blocking verify:ocr
使用者 Windows 的 npm.cmd run verify:ocr 失敗於 frontend/scripts/test-permit-evidence.mjs:50（actual F, expected M），不代表 Docker Build 失敗。原始 permitFieldEvidence.ts 明確讓 semantic-row F 在 MRZ M 衝突時優先；修正兩個陳舊預期，增加弱 label 不得蓋 MRZ 的測試。production selector 不變。需再跑 npm.cmd run verify:ocr，若有後續 test 失敗先修測試而非亂改 production。Decision D-102，main、無 Actions、無私人資料。

## 2026-10-16 — npm verify:ocr permit sex ROI rounding fix
已確認 latest npm verify:ocr 在 test-permit-sex-retry 固定 ROI 高度多一像素，修正為浮點誤差容忍的 ceil；新增整數與非整數尺寸守衛。須在 Windows 重新跑 npm.cmd run verify:ocr 才能確認完整套件。前一份截圖另有 test-permit-evidence M/F 不同預期，尚未確認是否可重現；若出現應獨立調查。護照正式成績仍 14/19、台胞證 13/13，上次 Docker Build 已成功。

## 2026-10-16 — OCR regression suite source guard updated
User's Windows verify:ocr reached passport crop diagnostic test, failed due to source order assertion missing newer `passportCharacterCoverage` field. Fixed test and documented D-102. Need rerun `cd frontend; npm.cmd run verify:ocr` locally; not a model accuracy change. Main-only, no Actions or personal data.

## 2026-10-16 — 回歸測試阻塞修正待驗證
Windows `npm.cmd run verify:ocr` 最新一次在 `test-server-recognition-smoke.mjs` 的 WASM fallback 靜態斷言失敗：服務實際 `return await execute('wasm', true)`，斷言僅認 `return execute`。最新 main 改斷言容許有／無 await；無服務行為變更。使用者要求先完整驗證再轉移對話。先取得完整回歸測試通過截圖；不需再跑 32 張 OCR Validation 或重新調模型。延續 main，不觸發 Actions。


## 2026-10-16 — D-103：PP-OCRv3 繁中第二模型人工覆核候選（待 Windows runtime / Validation）
- 這批不再擴張姓名組框、ROI 或拼音 fallback。正式 PP-OCRv5 Mobile 與 pipeline 2026.10.11.29 保持不變；第二模型只補充人工覆核候選。
- 模型名稱固定更正為 chinese_cht_PP-OCRv3_rec_mobile.onnx。RapidOCR 的 v4-traditional 路由名稱不代表 PP-OCRv4 recognition 權重；本次 Docker 固定 RapidOCR 實驗同一 ONNX SHA-256：779656d044ce388045e02ea9244724616194e63928606436cdfc6dc3c9528cc6。
- Browser 橋接：Docker 下載上述固定 ONNX，搭配官方 PaddlePaddle chinese_cht_PP-OCRv3_mobile_rec 在固定 commit 083f1a89e8efdedbd748514157e12f5a05b33bc3 的 inference.yml，封裝為 PaddleOCR.js 所需未壓縮 ustar。這只是相容候選，仍需 Windows Docker build / browser runtime 證明；不得因程式已接線就宣稱模型可用。
- 啟動門檻：只限護照，且正式結果 chineseNameRomanizationStatus 不是 compatible、MRZ 已有 surname / givenNames 時執行。台胞證與身分證完全不呼叫第二模型。
- 安全門檻：第二模型所有候選仍使用 production compareChineseNameToMrzRomanization；只有 strict compatible 且 compatible 候選唯一時才形成 suggestion。零個或多個 compatible 候選都 abstain。
- 絕不自動覆寫：suggestion 只寫入既有私人 ocrPayloadJson.secondaryChineseNameReview；result.chineseName、scan item nameZh、originalFields.nameZh 仍保持正式主模型輸出。Review queue API 只抽出 suggestion 給待審核畫面，操作員必須點「人工套用候選」並對照照片後才會進入表單。
- 第二模型初始化、模型下載或推論失敗只標記 unavailable，不能阻止 PP-OCRv5 結果加入待審核。
- 私人 19 張離線實驗證明此 recognizer 有互補性，但瀏覽器橋接使用 PP-OCRv5 Mobile detector + 現有 broad VIZ crop，不等同原 RapidOCR detector/runtime，故不能直接把離線 2 張 rescue 換算成 production 16/19。
- 正式基準仍是護照 14/19、台胞證 13/13。只有完成本機 verify:ocr、Docker build/browser runtime，再跑固定 Validation，才能更新準確率。

## 2026-10-16 — D-103 wiring correction before user validation
Post-commit diff review caught and corrected a malformed Docker candidate-model block plus a misplaced backend positional argument. The corrected tree keeps ChineseNameReviewCandidate only in ScanItemResponse, never ReviewedDocumentInput, and adds regression guards for both mistakes. No Windows build/runtime claim yet; next step is local pull + verify:ocr + Docker build/browser smoke, then authorized real passport check.

## 2026-10-17 — D-104：護照局部反光與防偽底紋離線診斷（尚未執行）
- 使用者提供四個護照中文姓名區域截圖。觀察到密集水平防偽紋、局部反光、紅色底圖交疊文字；影像問題只是合理假說，不可從截圖直接確定 Detector 或 Recognizer 責任。
- 新增 `training/experiments/diagnose_passport_name_texture.py`，只讀本機私人 ZIP 的 `splits/validation.jsonl` 及當次 `.29` 的 `missingCandidateSampleIds`（四張），比較 original、local_luminance、reduced_chroma、grayscale；均用同一個 RapidOCR model 與既有 broad VIZ 座標。只輸出匯總計數，不列姓名、OCR 文字、樣本 ID 或照片。
- 影像變體只用來診斷可能的反光／防偽色彩干擾，不修改圖片或訓練資料、不修改 PP-OCRv5 正式流程、D-103、台胞證或身分證。模型預設 `v3-cht` 使用 RapidOCR v4-traditional 路由（實為 PP-OCRv3 繁體字權重），也可切換 `v6-small`。
- OCR boxes 是模型自己預測的幾何，非人工真值標註框；不能據此證明 Detection 漏掉正確姓名。固定 Validation 失敗四張只用於診斷，任何產生的增益不可視為獨立泛化或正式 pipeline 準確率提高。正式基準仍護照 14/19、台胞證 13/13。
- Windows 原本有私人 RapidOCR 虛擬環境即可於 repo 根目錄執行：
  `python training/experiments/diagnose_passport_name_texture.py "<private-export.zip>" --production-index "<private-29-index.json>"`
- 尚未在使用者原主機執行，沒有任何真實辨識數字。禁止 GitHub Actions；私人資料不可上傳 GitHub／聊天。


## 2026-10-17 — D-105 人工覆核候選狀態接線
- 由既有 ocrPayloadJson 只抽取合法狀態 enum 到 ScanItemResponse.ChineseNameReviewStatus，待審核護照無候選時顯示簡短原因；suggested 沿用人工套用按鈕。沒有額外模型推論／個資輸出，也未更動正式 OCR。
- 此提交僅為端到端可觀測性改進，尚待 Windows verify:ocr、Docker build 與四張授權護照測試。不宣稱準確率上升。


## 2026-10-17 — D-106 護照簡體 OCR 自動轉繁體顯示
- 正式護照 nameZh 採既有單義簡→繁轉換（含臺灣姓名常見 温→溫 的顯示正規化），nameZhOnDocument 與原始 OCR payload 保留原樣。PP-OCRv3 第二模型建議也先安全轉繁再進既有 MRZ strict comparator；一對多映射不自行猜。沒有修改模型、影像、固定 Validation 或台胞證流程。
- 待 Windows npm verify:ocr / Docker build 與真實證件人工確認，不能宣稱識別準確率改善。


## 2026-10-17 — D-107 既有護照審核欄位繁體轉換入口修正
- 使用者反饋 D-106 後待審核護照仍顯示 温、砚。根因：TourDetailPage watch(currentDocument.scanItemId) 初始化表單僅針對台胞證做繁轉；護照直接使用資料庫先前持久化的 nameZh。補上 PENDING 護照表單入口的唯一對應簡轉繁，保留已審核記錄及原始 OCR 證據，不改其他證件與第二模型門檻。
- 尚待使用者 Windows npm verify:ocr / build 與待審核 UI 實測；不能宣稱自動 OCR 準確率上升。


## 2026-10-17 — D-108 第二模型匿名候選流失計數
- 候選源 service 輸出 candidateCount、ambiguousScriptCount、scriptConvertedCount、compatibleCandidateCount。批次掃描只寫有限數量到私人 OCR payload；後端 ScanItemResponse 只提供匿名中文計數字串；待審核護照姓名區下方一行顯示，不新增測試按鈕、不暴露實際 OCR candidate。已審核不顯示。
- 重要限制：candidateCount 是通過 plausible 過濾後的候選數，不是 OCR 原始框數或可證明 Detection/Recognition 根因的數據。真實照片掃描與 Windows 編譯仍待跑，禁止宣稱準確率提升。


## 2026-10-17 — D-109 missing record vs not attempted
- Updated ScanItemResponse review-only status to distinguish legacy-no-record and not-attempted. No second inference or automatic traveler edits. Need Windows verify:ocr + docker and inspection of same pending review, do not rerun 32-image Validation.


## 2026-10-17 — D-110：第二模型四張候選缺失的本機 comparator 稽核工具
- 新增 training/experiments/audit_passport_secondary_candidates.py。僅讀私人 Validation ZIP 和 .29 本機錯誤索引，RapidOCR v3-CHT 對四張樣本執行 broad VIZ，將姓名候選送進既有 frontend/scripts/eval-v6-mrz-candidates.mjs 正式 comparator，輸出匿名 Validation 序號、正確姓名是否曾出現在 raw row，以及 comparator 匯總；不印出姓名、樣本 ID、影像或原始候選。
- 明確限制：Python 使用 v6 detector，瀏覽器 D-103 使用 v5 detector；此工具只能區分離線候選與 MRZ comparator 假設，不會重建 browser 的 6 個候選，也不能稱已救回潘姵君。D-103 selector 與 .29 正式基準完全不變。不執行 GitHub Actions。


## 2026-10-17 — D-111：用私人 Train 分組做 v6 Small vs v3-CHT 配對辨識 A/B（待本機執行）
- 先前離線 Validation 四張補救證據顯示 v3 有 2 張 exact OCR row，但 strict MRZ 唯一候選曾錯選 1 張、救回 0 張。停止在固定 Validation 反覆調 selector，也不放寬拼音門檻。
- 新增 training/experiments/compare_passport_recognition_train.py，**只讀 splits/train.jsonl（record.split=train 且 documentType=PASSPORT）**，同一張 broad VIZ ROI 分別用 RapidOCR PP-OCRv6 Small 和 PP-OCRv3 Traditional Chinese Mobile recognition 比較 raw exact、原有 truth-blind spatial gate 唯一正確／錯誤／棄權、paired v6-only / v3-only / both / neither、median runtime。僅輸出匿名統計，不輸出圖片、OCR 原文、姓名或任何識別碼。
- 嚴守：這不是可證明瀏覽器 D-103 的 PP-OCRv5 detector 行為，也不作正式 14/19、13/13 成績宣稱。只有 train 組表現有穩定互補、且錯選風險可控，才另提出隔離 browser-compatible recognition 候選驗證；固定 Validation/Test 最終獨立留用。不能以這份結果直接改正式 PP-OCRv5 或增加 fallback。
- Windows (private ZIP only): `python training/experiments/compare_passport_recognition_train.py "$HOME\\Downloads\\ocr-training-dataset-20261017-051947.zip"`。若 train 組沒有護照，直接記錄不能實測，不拿 Validation 冒充。禁止 Actions。


## 2026-10-17 — D-112：Train A/B 選取器全棄權的評估歸因（待本機驗證）
- D-111 86 張 Train 護照：v6 Small raw exact 77/86、v3 CHT 42/86、v6-only 35、v3-only 0，兩模型 spatial gate 均 86/86 棄權；不能把棄權直接當模型失敗。
- 在 train-only 比較工具增加匿名 metadata_missing、metadata_count_mismatch、no_ocr_rows、standalone Han row count，以及三個**唯讀** gate ablation（無 label 錨點、無 upper ROI、兩者皆無）的 unique_correct / unique_wrong / ambiguous。保留原正式 gate 指標，對所有模型使用相同評估。這僅用來找出棄權原因，不允許將 ablation 接入正式姓名選取器。
- 重新跑 Train 86 張即可，不重跑固定 Validation，也不加 UI、影像規則或拼音 fallback。PP-OCRv5 正式 14/19、台胞證 13/13 均不變。Windows runtime 待執行；不啟動 GitHub Actions。


## 2026-10-17 — D-113：護照雙語姓名標籤與姓名下一行的純離線定位對照
- D-112 Train 86 張表明 v6 raw exact 77、v3 42，metadata 缺失 0；現有 label-only anchor 0/86，但去除錨點仍會產生錯選，故**禁止直接取消定位門檻**。
- 新增 train A/B 中獨立 `bilingual_label_*` 診斷分支：識別護照常見 `姓名 / Name (Surname, Given names)` 的 OCR 文字形式，容許姓名位於標籤下方相鄰行；既有預設 `propose_names` 未修改行為，新增 `passport_label=False` 僅在 D-111 train-only A/B 明確啟用。
- 分別輸出唯一正確、唯一錯誤、歧義與無候選次數；若新定位增加錯選或無收益即停止，不上線。這不是 v6 browser runtime，仍未驗證 v6 model 的 JS SDK metadata / preprocessing / decoder 相容性；不應把 v6 ONNX 當 v5 權重直接替換。正式 .29 護照 14/19、台胞證 13/13 不變；無 Actions、無證件內容上傳。


## 2026-10-17 — D-113 語法錯誤修復
- 使用者於原本 Windows .venv 執行 train A/B 回報 TRAIN_AB_FAILED: SyntaxError。確認 D-113 的 training/experiments/v6_name_gate.py 被字串替換操作破壞（未終止 regex、重複函式及多餘括號），不是虛擬環境問題。
- 改從 D-112 的乾淨版本重建檔案，保留唯一 propose_names；雙語標籤支援僅在 passport_label=True 啟用。已於隔離 Python 驗證相同 regex / bilingual geometry 基本測試及語法，但未在使用者私有 ZIP 執行 86 張 Train，不能宣稱 A/B 結果或正式準確率改善。
- 後續使用 python -m py_compile 做單檔語法 gate；不需 npm 或 Docker，不啟動 GitHub Actions。


## 2026-10-17 — D-114：PP-OCRv6 Small browser review-only 方案（未經 Windows runtime 驗證）
- 經查 @paddleocr/paddleocr-js@0.4.2 已內建 ocrVersion=PP-OCRv6 及 small detector/recognizer，無須自己改 v5 字典；參考 https://github.com/PaddlePaddle/PaddleOCR/blob/main/paddleocr-js/packages/core/README.md。
- 在 frontend/src/services/passportV6ChineseNameReviewCandidate.ts 建立獨立 v6 Worker（PP-OCRv6_small_det + PP-OCRv6_small_rec），只取代原 D-103 的護照 review-only 第二來源，PP-OCRv5 正式掃描流程未改。原 v3 service 和模型仍保留可回退。
- Docker 使用固定鏡像修訂 e6fe11f 的 v6 det/rec ONNX tar，重新封裝成本機模型資產，檢查模型名稱及 tar 結構。只有在實際 Windows Docker build、browser Worker runtime 成功後可認定可用。固定上游 revision 不等於已取得本地 SHA 校驗證據，後續應記錄實際哈希。
- 與既有 D-103 完全同一安全政策：僅 PP-OCRv5 未有 reliable Chinese name + MRZ 存在時執行；只有唯一 strict-compatible 才提出人工審核 suggestion，不能改 result.chineseName 或 traveler.nameZh。錯誤時 unavailable，台胞證／身分證不受影響。
- Train 86 張的 v6 raw exact 77/86 不是正式準確率；bilingual A/B 22 correct、1 wrong，故不允許無人覆核自動採用。正式 .29 保持護照 14/19、台胞證 13/13。必須驗證已知困難姓名及已正確樣本無回歸，再談 19/19。


## 2026-10-17 — D-115：雙頁縱向護照 v6 下半頁姓名候選補救（待 Windows 實測）
- 使用者提供的真實拍照是上下兩頁同框；D-114 固定 broad VIZ ROI x=.24..98 / y=.12..70，中文姓名位在 ROI 下緣，實際 v6 僅有 1 候選、MRZ 相容 0。
- 僅對長高比 >=1.2 的護照照片，且第一次 v6 沒有 strict-compatible 姓名時，再在 x=.16..96 / y=.43..81 做一次有界高品質 crop 的 v6 OCR；只有重試得到**唯一 strict-compatible** 才回傳人工 suggestion，否則保留第一次的無候選結果。不增加正式 PP-OCRv5 推論次數，不修改正式姓名欄、台胞證或身分證，也不加入自動採用。
- 本次只是一項有真實畫面依據的可逆補救，不能聲稱能辨出潘姵君或提升固定 14/19。仍需 Windows npm verify:ocr 與 4 張原本失敗護照端到端實測，統計實際 suggestion 正確與否；錯選即停止此策略。不啟動 GitHub Actions。


## 2026-10-17 — D-116：人工審核儲存後人物分組跳動修復
- 使用者實測：填入完整護照中文姓名，按「儲存審核」後彈窗於 5 筆與 2 筆護照分頁群組跳動，已審核勾選數增加。根因是 saveReview(false) 執行 reviewScanItem + reloadQueue 後，依新姓名合併結果重新綁定 updatedParent；此時人物分組可能變化。
- 修正「儲存審核／儲存修改」成功後刷新 queue 並關閉彈窗，不再默默跳到另一人物分組；「儲存並審核下一位」仍走明確 next 流程，失敗時保留錯誤訊息，不改 DB 合併政策、OCR、照片或個資。
- 加入 source regression guard，仍待 Windows verify:ocr 與前端實際操作驗收；未聲稱 OCR 精準度提升。GitHub Actions 禁止啟動。


## 2026-10-17 — D-117：同一旅客多份證件審核頁籤版本顯示
- 原審核視窗六個護照頁籤只標「護照」，使用者無法分辨資料來源的新舊。根據現有 ScanItemResponse.createdAt 與 scanItemId 穩定排序同證件類型掃描紀錄，顯示第 N 版、最新掃描；對當前頁加一行 版本 N/總數說明。
- 僅前端顯示，不更改資料庫主檔、document_versions、人工審核與去重政策。不把「最新上傳」當「最新核發／有效」；核發時間並非目前欄位。待 Windows build 與瀏覽器操作驗收。


## 2026-10-18 — D-118：相同實體護照的精確分組補救（待本機驗證）
- 發現 ReassignReviewedItem 在 nameZh 已填時，FindDraftMatches 只用中文姓名，不再比較相同護照上的英文姓名，造成先掃空白後人工補正時同一本護照的掃描被拆成不同 draft person。
- 新增審核時強證據補救：同團別、護照類型、非空且完全相同護照號碼、英文姓名、生日、性別，且只有唯一其他 draft ID、有效身分證號無衝突時，才將目前 scan item 指回該 draft。任一條件不滿足維持原行為，不使用模糊字形或單純姓名合併。
- 此項是後續人工審核／重新儲存時的 draft 分組修正，**不會偷偷合併過去已審核的正式 traveler 主檔，也不會自動修改舊掃描**；既有重複的正式旅客需另外安全更正流程。正式 OCR、台胞證不變；Windows dotnet build / 端到端覆核待驗證。


## 2026-10-18 — D-119：既有手動旅客合併加入姓名衝突保護
- 發現既有 TravelersPage 與 PostgresTravelerStore.MergeTravelers 已有正式人工合併流程，會保留並搬移證件版本、團別關聯、掃描草稿。因此不再新增重複 Merge API。
- 現有阻擋僅依出生日期、性別、身分證號衝突，可能誤把同生日同性別但英文／中文姓名不同的兩人合併。新增**前端及後端一致的保守檢查**：兩筆都有非空英文姓名但不同（忽略 ASCII 大小寫）、或都有非空中文姓名但不同，阻擋合併並要求先人工核實修正。任一方缺中文姓名仍可沿用原明確人工確認流程（例如 OCR 當初空白者）。
- 不自動更動既有旅客／資料庫，也不為已審核資料執行自動合併。正式主檔合併必須使用既有旅客頁手動操作；仍待 dotnet build、npm build 與完整端到端測試。未碰 OCR，也不宣稱 19/19。


## 2026-10-18 — D-120：PP-OCRv6 標籤黏連姓名候選補救（僅人工覆核）
- 發現目前 shared extractPassportChineseNameCandidatesForProbe 遇到同列 `姓名XXX` 時直接由 isPlausibleTaiwanChineseName 的標籤排除規則拒絕，可能在進 MRZ 比對之前丟失正確姓名。
- 新增 v6-only `extractPassportV6ReviewCandidates`：只接受 OCR 原始列或現有文字列明確以 `姓名`／`中文姓名` 開頭且**其後恰好 2–4 個漢字**的格式；保持原候選管線，合併去重、既有簡繁與 strict MRZ 過濾。不加入人名答案、寬鬆拼音或新影像 ROI。
- v6 一律只產生人工建議，PP-OCRv5 正式 selector 與台胞證不變；不能聲稱正式 14/19 已提高。提交後須本機 verify:ocr、Docker 與新一批有授權護照真實驗收。Actions 不執行。


## 2026-10-18 — D-121 全批 OCR 0.7 秒模型／執行資源下載失敗：資產隔離預檢
- 使用者在 4 張護照上均於 0.7 秒左右出現「PaddleOCR 模型／執行資源下載失敗」；這發生於正式 PP-OCRv5 初始化，不能歸因於剛新增的 PP-OCRv6 候選規則，且不代表網路本身故障。
- 新增 frontend/scripts/check-local-ocr-assets.mjs，可在 Docker 運行時由原主機 Node 直接檢查 4 個同源模型 tar HTTP 回應、大小與 ustar header；不載入私人證件或資料庫、不修改任何主線 OCR。以 `node frontend/scripts/check-local-ocr-assets.mjs` 執行。預檢通過只證明模型 HTTP 資產存在，仍須針對 browser Worker、WASM 與 Console Error 進一步辨識。
- 本批只建立故障定位手段，未宣稱已修復全部失敗；不需要重新上傳 4 張或做 Validation。GitHub Actions 禁止執行。


## 2026-10-19 — D-122：v6 兩段辨識證據容錯與來源追溯
- 使用者的真實掃描已取得 PP-OCRv6 正確「人工覆核候選」，MRZ 相容 1；**這不是自動填入正確率或固定 19 張正式 Validation 的提升**。D-120 / D-115 哪個裁切實際命中尚未確認。
- 修補 v6 第二次 lower-page crop / predict 發生異常時會直接丟棄第一次 broad-viz 結果的容錯缺口；現在第一輪辨識完成後，第二輪例外只會保留第一輪匿名結果，維持 strict MRZ 人工覆核門檻。若下半頁唯一相容則 candidateSource='lower-page'，否則 'broad-viz'；僅寫到現有私人 OCR payload，不新增 UI、不包含姓名。
- 不改 PP-OCRv5 主模型、自動填值、台胞證、資料庫結構與既有旅客。待本機 npm verify:ocr 及 Docker Build；此項是容錯／可觀測性，不宣稱 19/19。禁止 Actions。


## 2026-10-19 — D-123：第二模型下半頁歧義候選不得被當作無候選
- 檢查 D-122 發現 lower-page 第二次 OCR 取得多個 strict MRZ 相容候選時，現有 `retry.compatibleCandidates.length === 1` 將整筆重試證據丟棄，使狀態誤標 `no-compatible-candidate`。
- 改為只要 retry 有至少 1 個相容候選即保留該次證據；1 個維持 review-only suggestion，2 個以上正確標記 `ambiguous-compatible-candidates` 並絕不提供自動或人工一鍵套用候選。重試 0 候選或異常繼續保留 broad-viz 的原始證據。
- 這是風險分類正確性修補，不提高 PP-OCRv5 正式 14/19，不動台胞證 13/13，也不能據此稱 19/19。仍待 Windows verify:ocr 與 Docker / 真實資料驗收。GitHub Actions 不可啟動。


## 2026-10-19 — D-124：凍結 19 張護照的離線 v6 獨立候選驗收
- 已確認 D-123 Windows `verify:ocr` / Docker 無錯、原本難例實際 PP-OCRv6 有正確人工覆核候選（MRZ 相容 1），但主線正式 .29 仍護照 14/19、台胞證 13/13。
- 新增 `training/experiments/evaluate_v6_frozen_passports.py`。只讀原本私人 ZIP `splits/validation.jsonl` 的 19 張護照，使用既有 RapidOCR v6 Small + D-113 雙語標籤定位 gate 統計 `raw_exact`、`unique_correct`、`unique_wrong`、`ambiguous`、`abstained`。強制總數 19、不輸出 OCR 文字、身份或 sample ID，不改任何正式演算法、Validation split 或 OCR Quality baseline。
- **限制**：Python v6 detector/crop/gate 與瀏覽器 PaddleOCR.js/D-115 的實際輸入不同；這只是固定 cohort 的 read-only 風險評估，不能認定瀏覽器可自動達 19/19；結果不得拿來反覆調整 selector。高錯選或高棄權時應停止此推論路線並保持人工覆核。
- 原主機指令：`& .\\.venv\\Scripts\\python.exe training/experiments/evaluate_v6_frozen_passports.py "$HOME\\Downloads\\ocr-training-dataset-20261017-051947.zip"`。Python / Windows 未執行，無正式準確率更新。禁止 GitHub Actions。


## 2026-10-19 — D-125：瀏覽器原生 v6 19 張候選驗收（待 Windows 實測）
- OCR 品質頁新增一個獨立固定 Validation 操作，僅從 private Validation 取得 19 張護照，不碰 Test；逐張用正式 PP-OCRv5 取得 MRZ，再讓真實 PaddleOCR.js PP-OCRv6 在主模型姓名不正確時候選辨識，統計 v6 正確／錯誤／歧義／棄權／錯誤次數，僅呈現匿名匯總。
- **此為研發診斷**：比較 ground truth 只用來評分、不當 MRZ 提示；不寫 benchmark baseline、不存個資，也不自動套用姓名。固定 Validation 此前已參與研究，不能稱為 hold-out Test；Python D-124 的 2/19 不等於瀏覽器結果。主模型正式基準仍 14/19、台胞證 13/13。
- 待原 Windows npm verify:ocr、Docker 建置與瀏覽器操作檢查；GitHub Actions 禁止啟動。


## 2026-10-19 — D-126：瀏覽器 v6 真實啟動門檻缺口及唯讀 shadow
- D-125 19 張實測主模型 14/19；v6 1 張正確候選、0 錯誤唯一候選、3 歧義、0 棄權與執行錯誤。五張主模型錯誤並非全部必然啟動 v6；`chineseNameRomanizationStatus === compatible` 會直接跳過。
- 在既有 19 張驗收按鈕內，新增「拼音相容因此跳過 v6」之主模型正確／錯誤統計，並為此類全數在瀏覽器做**唯讀 shadow**（不以答案決定觸發，僅比較最後結果），分開計數唯一正確、唯一錯誤、歧義、棄權、錯誤。不得將 shadow 用於正式掃描或自動填值，也不得把有人工候選算為正式 19/19。
- 不新增 UI 控制項，不改 PP-OCRv5 判斷／台胞證／證件資料；待本機 verify:ocr + Docker 與固定 19 張一批驗收。禁止 Actions。


## 2026-10-19 — D-127：拼音相容跳過 v6 的匿名交叉統計
- D-126 使用者實測：主模型 14/19，錯誤 5；拼音相容跳過 v6 的主模型正確 12、錯誤 3，該 15 張 shadow 匯總正確 5、錯誤 1、歧義 9。聚合數字不足以推論三張主模型錯誤是否被 v6 救回。
- 沿用既有瀏覽器 19 張驗收入口，新增唯讀 `shadowOnWrong` / `shadowOnCorrect` 兩組匿名正確、錯誤、歧義、棄權與執行錯誤交叉統計。模型啟動仍只由 `chineseNameRomanizationStatus` 及真實 MRZ 決定，ground truth 僅供統計；不記錄逐人姓名、證號或 ID，不修改主模型、DB、台胞證、候選採用政策。
- 本機驗收待 `npm run verify:ocr`、前端 Docker build 及頁面同一個 v6 19 張按鈕；不能據此宣稱 19/19，固定 Validation 不可再調參。禁止 Actions。


## 2026-10-19 — D-128：護照姓名反光低對比的隔離候選補救（待實測）
- D-127 實測主模型 14/19、v6 正確人工候選 1；主模型拼音相容但錯誤 3 張，shadow 正確 0、錯誤 1、棄權 2。停止調整模型啟動條件與拼音 fallback。
- 新增僅 v6 **人工覆核**使用的溫和亮度／對比 normalization：先統計 ROI 亮度 5/95 百分位，排除過低動態範圍及已有充分曝光情形，限制 gain <=1.4，保留原色與幾何，獨立再辨識一次。只有既有 broad 和適用的 lower-page 均無相容候選時觸發，重試即使有候選也不自動寫入；失敗保留原證據。候選來源記為 contrast-review；正常 OCR 主線／台胞證不變。
- 此方法不能消除已飽和反光，也尚無 Train 或端到端增益證據；若錯選或耗時增加過多即移除。不可在固定 Validation/Test 上持續微調；正式 14/19 未變。禁止 Actions。


## 2026-10-19 — D-128 編譯修復
- Windows Docker frontend build 報 TS1184: nested `export async function normalizePassportNameRoiLuminance` 與 TS2322: batch review source union 缺少 `contrast-review`。前者移除錯置的 export 以保留函式內局部 helper，後者同步 union。僅修復型別/作用域，未變更候選選取規則與正式 OCR。等待原主機 `npm.cmd run build` / `verify:ocr` 結果；不得宣稱已通過。


## 2026-10-19 — D-129：來源歸因與對比度補救去留驗收
- D-128 Windows npm build + Docker 已確認通過，尚無 19 張 v6 重新驗收結果。把低對比 helper 從巢狀內部移到 module 私有函式（不 export），減少後續誤用與編譯事故，保持行為不變。
- 在既有『瀏覽器 v6 19 張』驗收結果增加實際啟動 v6 的來源三分類 `broad-viz`、`lower-page`、`contrast-review` 之正確／錯誤／歧義匿名統計；僅已執行第二模型且未因正式拼音門檻跳過的結果納入。Shadow 仍獨立，不算任何新補救。
- 決策門檻：如果 contrast-review 無新增正確候選，或產生錯誤／明顯增加耗時，直接撤回 D-128，不繼續調對比參數。資料集已多次用於研究，不能稱為 holdout 泛化率；不改主模型、台胞證、正式姓名、資料庫或 Test。待本機 verify:ocr、Docker、同一個 19 張驗收按鈕。


## 2026-10-19 — D-130：停止無收益的低對比護照補救
- D-129 固定 19 張瀏覽器實測：正式護照 14/19，v6 唯一正確人工候選 1，錯誤 0，歧義 3。broad VIZ 正確 0；lower-page 正確 1、歧義 3；D-128 contrast-review 正確 0、錯誤 0、歧義 0。
- 依預設停止標準撤回 D-128 的 contrast normalization helper 與第三次模型辨識，移除其來源型別和驗收統計，保留 PP-OCRv5 正式主線與 v6 lower-page 人工候選；不再用這組固定 Validation 微調亮度增益或裁切參數。
- 本次僅修正程式及文件，尚待 Windows verify:ocr / Docker Build；不能宣稱正式準確率改善。GitHub Actions 禁止執行。


## 2026-10-19 — D-131：D-130 已確認完成，下一步只跑一次 V2 本機上線驗收
- 新對話開始時 GitHub `main` 實際 HEAD 已為 `a65cfd8c3c6902cafba974b88a0b45da10ffb096`（`revert: remove ineffective v6 contrast retry after validation [skip ci]`），所以 D-130 **已提交**，不要再重做。production code 已無 D-128 contrast retry；PP-OCRv6 lower-page review-only rescue 保留。
- 已新增 D-131 `scripts/verify-v2-launch.ps1` 和 `docs/V2_LAUNCH_ACCEPTANCE.md`。驗收以獨立 Docker project/ports/volume 執行，不碰正常 5173/5080 與正常 PostgreSQL volume；會把 frontend `verify:v2`（其中包含完整 `verify:ocr`）、backend build、Docker、schema、synthetic batch/review、retention、backup/restore、restart persistence 一次跑完。
- 原 Windows 主機更新後只需在 repo root 執行：
  ```powershell
  .\scripts\verify-v2-launch.ps1
  ```
  目前尚未在使用者 Windows 主機執行，因此不要寫成已 PASS；若失敗，保留完整 console output 修正該 blocker，不要轉回 OCR 規則研究。
- 自動 PASS 後只剩一次真實瀏覽器驗收：三類證件批次／單張失敗重試、照片 zoom/pan/rotate、審核後再編輯、同人多版本、人工 merge 衝突阻擋、CSV 欄位選擇／排序／下載內容。**不要重跑 D-124～D-129 固定 19 張研究。**
- 正式 OCR 基準仍護照 14/19、台胞證 13/13；v6 人工候選不計入全自動準確率。GitHub Actions 仍禁止啟動。


## 2026-10-19 — D-131 結案／D-132 真實流程驗收
- 使用者確認 Windows `scripts/verify-v2-launch.ps1` 已成功。沒有收到終端機成功 log 的逐行內容，以使用者回報 PASS 記錄，不延伸成真實 UI/OCR 都已通過。
- 下一階段 D-132：一次完整旅行社操作流程驗收（用本機私人測試資料，涵蓋護照/台胞證/身分證批次上傳、失敗重試、人工審核和重新編輯、版本及手動合併、CSV 欄位／排序／中文），依實際 blocker 做修正。保留 PP-OCRv5 主模型 + PP-OCRv6 lower-page review-only，正式基準 14/19、13/13 不變。禁止 Actions。


## 2026-10-19 — D-131 更正：真實截圖顯示 [4/8] FAILED
- 前次根據使用者「成功了」而記錄的 D-131 PASS／D-132 啟動已被最新完整輸出推翻。原 Windows 已完成 frontend/build/Docker 相關階段，但在 [4/8] 遇到 `Review queue should be empty after both reviews (Actual 1)`，整批驗收未完成，尚不可開始 D-132。
- 原因：`ListReviewQueue` 回傳全部 draft 群組，包括已審核證件，設計目的包含重新編輯。測試錯把 queue 當 pending-only；已改成 1 個群組且 2 份 REVIEWED、0 份 PENDING。此為驗收斷言修正，不更改產品功能；待 Windows 再完整執行，勿宣稱 PASS。禁止 GitHub Actions。


## 2026-10-19 — D-131 最終通過；D-132 啟動
- 最新使用者 Windows 截圖已證實 `scripts/verify-v2-launch.ps1` 全部完成：`[8/8] Automated V2 launch acceptance passed`，backup restore 成功、restart persistence 階段完成、隔離 Docker stack/volume 成功清理。先前 4/8 failure 和誤記錄 PASS 已被此新證據取代。
- D-131 結案，轉為 D-132 真實瀏覽器整批驗收：護照/台胞證/身分證掃描與重試、人工審核／再編輯、版本／合併保護、CSV。正式 pipeline `.29`，自動 OCR 基準 14/19 護照、13/13 台胞證；v6 人工候選不算自動正確率。不得啟動 Actions 或提交證件資料。


## D-132 目前已提交程式（待本機驗證）
- Pending passport 主模型姓名空白且 v6 唯一 MRZ 相容 candidate 時，**只在審核表單預填**，沒有自動寫入正式資料，仍須人工確認與明確儲存。
- 「温／溫」在旅客**人工合併**時視為同等字形，並保留出生日期/性別/身分證號/英文姓名衝突保護；證件原文不更動。自動歸組仍未擴大，不能宣稱已完成全系統姓名標準化。
- 前後端及 guards 尚待 Windows `npm.cmd run verify:v2` 與 `dotnet build`；沒有啟動 GitHub Actions。


## 2026-10-19 — D-132 實測進度
- 使用者真實瀏覽器截圖已證實：v6 唯一 MRZ 相容候選在空白待審核護照中預填、操作員儲存後顯示已審核、正式旅客資料可用英文姓名搜尋且列出護照版本數 1。
- 保持後續待驗收：跨證件合併及异體字處理、同類證件多版本、CSV 欄位順序與內容、三證件批次失敗重試。任何真實姓名、身分證號、護照號、生日或原始圖片均不上傳 GitHub。


## 2026-10-19 — D-132 新增跨證件異體字端到端檢查（待 Windows 執行）
- main 加入隔離驗收新增案例：對合成護照「温…」與台胞證「溫…」分別建立 traveler，要求不得只因異體字自動合併，再明確執行人工 merge；檢查合併後兩份證件版本與不同原文字形都保留。已有 D-131 的完整合成驗收不被移除。
- 未修改正式 OCR、正式旅客自動合併、私人照片與資料集。下一次集中 Windows `scripts/verify-v2-launch.ps1` 才能證實新案例；請勿稱為已通過。


## 2026-10-19 — D-132 異體字端到端驗收暫停於 HTTP 400（原因待回應內容）
- Windows 截圖：原本 D-131 步驟成功啟動隔離 Docker 並進入 [4/8]，新增 D-132 `manual merge with equivalent name glyphs` 測試呼叫 API 時得到 HTTP 400；故 D-132 此案例 **沒有 PASS**，亦未進入後續 retention/restore 段落。本次隔離 stack / volume 已清除，不影響原本資料。
- 目前錯誤輸出只有 Invoke-RestMethod 400，**不足以判斷是護照或台胞證請求、欄位格式、抑或後端驗證**。不得猜測原因或放寬正式驗證器。更新 `scripts/verify-v2-launch.ps1` 的純合成資料 Invoke-Api 錯誤處理，補印 HTTP method、endpoint、status 與 JSON response details，下一次執行可直接知道根因。此次僅改善診斷，尚待 Windows 結果；禁止 Actions。


## 2026-10-19 — D-132 CSV 真正函式合成測試（待 Windows 實跑）
- 新增 `frontend/scripts/test-v2-export-functional.mjs`，從 `TourDetailPage.vue` 擷取實際 `escapeCsv`、`membersForExport`、`buildExportCsv` 函式並以 TypeScript transpile 執行合成案例，而不重寫 production CSV 邏輯。驗證中文姓名、含逗號欄位、欄位順序與值對齊、不同證件表的篩選、CRLF、Excel UTF-8 BOM 程式碼存在。
- 將此測試接入前端 `verify:v2`。不讀真實證件、不上傳個資、不變更 production OCR 或 CSV 邏輯、不啟動 Actions。**尚未在 Windows 執行，不能宣稱 CSV 已實際 PASS。** 真實下載的內容與 Excel 開啟仍需 D-132 一次操作驗收。


## 2026-10-19 — D-132 CSV Windows verify:v2 PASS
- 使用者提供 Windows PowerShell 成功截圖：既有 OCR regression、Vue TypeScript/Vite build、`test:v2-launch-guards` 與新加入的 `test:v2-export-functional` 全部執行完成，最後明確輸出 `D-132 production CSV synthetic content, filtering, and column order passed.` 並返回提示字元。
- Vite 的 browser-externalization 與 bundle size 警告不影響本次 build 成功，不表示 CSV 下載介面或真實 Excel 開檔已經驗收。下一步只需以本機 UI 驗證 CSV 實際下載與旅客證件版本，勿重跑這組 regression，不上傳個資，不啟動 GitHub Actions。


## 2026-10-19 — D-132 匯出真實 CSV 回饋：英文姓／英文名、日期格式與 Excel 欄寬
- 使用者提供兩份實際 CSV（僅在當前對話中檢查，不上傳 GitHub），現有日期來源已為 `YYYY-MM-DD`，但 Excel 開啟 CSV 會自行推斷日期顯示和欄寬；CSV 格式本身無法指定欄寬、日期儲存格格式、證件號碼文字格式。
- 前端 CSV 欄位新增 `nameEnSurname` 英文姓、`nameEnGivenNames` 英文名選項，從既有護照 MRZ 表示的 `SURNAME, GIVEN NAMES` 拆解；無逗號時留白避免猜錯姓。維持原英文全名欄位。生日／護照和台胞證有效期限在輸出前若符合年-月-日格式則月日補零；不改正式存檔資料。
- 更新 `test-v2-export-functional.mjs` 涵蓋姓名拆解和日期補零。CSV 純文字檔不能解決 Excel 欄寬及 Excel 自行轉型，應另新增正式 xlsx 匯出能力後再進行實際 UI 驗收；目前未宣稱系統已支援 xlsx。用上傳 CSV 另生成對話內 Excel 排版檢視版，並未上傳個資 GitHub。
- 證號應保留原始英數字串、不得去掉英文字母或轉數字；使用者對英文字母「不一樣」的具體期待待釐清。證件版本測試使用同人另一本有效證件（或純合成測試資料），不得任意改造真實護照號碼。


## 2026-10-19 — D-132：正式下載由 CSV 改為 Excel XLSX（待 Windows 驗證）
- 使用者要求不要 CSV；Excel 中護照號碼、身分證字號、台胞證號碼有英文字母或純數字時對齊不一致，欄寬太窄，日期月日須兩位數。正式 UI 匯出已改為單一 `.xlsx` 檔，依勾選產生多工作表；原欄位勾選與拖曳排序維持。預設所有儲存格以文字保留英數證號、前導零與日期字串，統一置中；欄寬根據內容估算，標題加粗、凍結首列及篩選。
- 新增瀏覽器端 `frontend/src/services/excelWorkbook.ts`（不使用雲端服務，不新增 NPM 套件），輸出 Open XML XLSX；替換 `TourDetailPage.vue` CSV 下載，前端顯示 Excel。舊 CSV 合成測試改為生成 XLSX ZIP 並檢查多表、內容、欄寬與文字格式，且同步更新 launch guards。
- D-132 原有英文姓／英文名欄位保留，可個別勾選；姓名無 MRZ 逗號格式時不臆測姓氏。日期欄按 `YYYY-MM-DD` 補零並輸出文字，避免 Excel 自動改格式。
- **尚未 Windows 實測／Excel 實際開檔，不能宣稱此修改 PASS。** 不啟動 GitHub Actions，也不把使用者私人 CSV 或證件上傳 repository。


## 2026-10-19 — D-132 Excel 匯出改為每種類一個獨立檔案（待 Windows 驗證）
- 使用者已實測 Excel 格式成功，但要求總表、護照、台胞證、身分證應分別下載 `.xlsx`，而非置於一個檔案中的多個工作表。
- `TourDetailPage.vue` 改為依勾選類型逐一產生獨立 XLSX，檔名為 `團別名稱-表別.xlsx`，單一檔案僅有自己的工作表；保留既有欄位勾選、拖曳排序、欄寬、置中、文字型證號與日期補零。
- 更新 `test-v2-export-functional.mjs` 防止回到單一多工作表檔。瀏覽器可能詢問是否允許同一網站下載多個檔案；如被封鎖需使用者允許。未啟動 GitHub Actions，尚待 Windows `verify:v2` 與實際下載確認。


## 2026-10-20 — D-132 Excel 分檔匯出使用者確認完成
- 使用者於更新後回覆「好了」，依此記錄四個表別改為各自下載獨立 XLSX 的實際操作已完成。未收到新下載檔逐格驗算，故不宣稱每個工作表所有資料皆另經人工逐筆核對。
- Excel 欄寬、文字證號、日期補零及可選英文姓／英文名設計保留；後續重點移至「同一旅客多份同類證件的歷史版本保留」，優先以合成資料回歸驗證，不為測試修改真實證件，也不重新做 OCR 固定 Validation。GitHub Actions 禁止啟動。


## 2026-10-20 — D-133 待驗收事項
- 本輪只更新前端護照號碼核對流程：欄位醒目、必須勾選已對照原圖才可儲存、證號修改及切換證件時要重新核對；前端格式守衛與 backend 相同。
- D-132 Excel 分檔、跨證件合併及護照多掃描歷史已得到使用者確認，不需重做；D-133 仍待 Windows Build 與 UI 實測，不可稱 PASS。既有真實個資不得上傳 GitHub，禁止 GitHub Actions。


## 2026-10-20 — V2 功能凍結：撤回 D-133 多餘的護照號碼勾選
- 使用者確認 V2 核心流程與效能已接近完成，要求停止擴充低效益功能，降低操作複雜度。據此撤回 D-133 的「每次護照審核／修改必須額外勾選確認」及其 reset/watcher/UI 提示，保留護照號碼醒目顯示及 5–20 碼英數格式檢查。
- 既有人工審核按儲存仍須明確操作；沒有改 OCR、MRZ、後端正式儲存、合併、版本、照片 retention、Excel 或資料庫。回歸守衛改為確認強制勾選不存在。
- 正式進入 **V2 功能凍結與上線收尾**：只修阻斷性錯誤（資料遺失、錯人合併、錯誤證號／匯出、重要效能問題）；不為小改善繼續開新功能／測試介面／模型實驗。這輪修改已提交，但 Windows verify:v2 / Docker 仍待集中驗證，不能宣稱已在原機 PASS。禁止 GitHub Actions。
