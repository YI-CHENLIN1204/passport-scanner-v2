# 護照中文姓名：辨識模型 A/B — 執行門檻與決策（2026-10-12）

## 2026-10-13 — Confirmed same-sample PP-OCRv6 Small complementarity on Windows
- User ran local PRIVATE ZIP + local current-production .29 missing-candidate/selector-blocked index against RapidOCR PP-OCRv6 Small. Observed `processed=19`, `standalone_exact=14`, `substring_only=2`, `failures=0`, `median_roi_ms=671` and `production_29_overlap={confirmed_missing_candidates:4, v6_standalone_rescue:1, v6_substring_potential:0, v6_absent:3, confirmed_selector_blocked:1, index_complete:true}`.
- This is the first actual **same-sample** additional complete name recognition candidate among the four genuine .29 candidate misses. It is NOT yet a confirmed end-to-end rescue: ROI model was run in local Python RapidOCR, not the browser; final name geometry/strict MRZ acceptability and regression on original correct 14 must be tested. Do not claim 15/19 as observed production accuracy.
- Model uses PP-OCRv6 Small via RapidOCR with its own pre/postprocessing. Prior PP-OCRv5 Server / chi_tra produced zero standalone rescues. Prioritize an isolated, browser-compatible v6 candidate integration gated by strict MRZ, use on true failure cases only. No private labels/photos/IDs in repo; never activate GitHub Actions.


## 2026-10-13 — PP-OCRv6 Small local RapidOCR pilot (new candidate architecture, untested on personal data)

Literature gate: RapidOCR v3.9+ officially supports PP-OCRv6 small/medium ONNX multilingual recognition with Traditional Chinese. RapidOCR project reported recognition standalone exact accuracy 0.8419 for PP-OCRv6 small vs 0.7355 for PP-OCRv5 mobile on their public recognition dataset; **these are not our passport measurements** and model/version/config comparisons need caution. Sources: https://rapidai.github.io/RapidOCRDocs/latest/model_list/ and https://rapidai.github.io/RapidOCRDocs/latest/blog/2026/06/18/rapidocr-%E9%9B%86%E6%88%90-pp-ocrv6-rec-%E6%A8%A1%E5%9E%8B%E8%AE%B0%E5%BD%95/

New experiment `training/experiments/bench_ppocrv6.py` runs RapidOCR's **correct v6 preprocessing and dictionary** locally rather than silently substituting a v6 ONNX into `@paddleocr/paddleocr-js@0.4.2` configured for v5. Requires Python 3.10+, `py -m pip install "rapidocr>=3.9,<4"`; export PRIVATE ZIP from OCR 品質 page to a local private directory, then `py training/experiments/bench_ppocrv6.py C:\\private\\ocr-training-dataset.zip` at repository root. The runner reads **only** `splits/validation.jsonl`, **only** `PASSPORT` images and ground-truth, at most 19, never Test/Train image bytes. It uses broad approximate VIZ ROI 24–98% width, 12–70% height with no production rotation/upscaling; results are anonymous aggregate standalone candidate matches and inference times, **not** a production end-to-end benchmark. It never prints/saves recognized strings, personal names, IDs or images. Model weights may download from RapidOCR public model repositories; private input images stay on the local machine. Keep zip OUTSIDE Git and never paste full OCR text.

Scope: only an optional pilot, not a replacement of browser-based production; no backend deployment or cloud image transmission. Need to establish 1) model initialization locally, 2) whether it rescues any of the four actual .29 misses (this 19-image aggregate alone does NOT establish same-sample rescue), 3) on-device browser Worker compatibility+dictionary and strict security gates before integration. Python pilot is not tested here with real ZIP or installed RapidOCR; do not claim accuracy gains. Formal baseline remains passport 14/19 and permit 13/13. No Actions.


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


## 目前已知

- 正式 pipeline `2026.10.11.29` 使用 `@paddleocr/paddleocr-js ^0.4.2`，配置 PP-OCRv5 mobile detection + mobile recognition、`lang: chinese_cht`、`backend:auto`，模型同源 `/paddle-models`。
- 使用者在 `.29` 固定 32 張 Validation：護照中文姓名與全欄 **14/19 (74%)**，台胞證全欄 **13/13 (100%)**。與 `.28` 持平。此為欠缺實際工作輸入照片的歷史 legacy Validation，不可當新照片 production 準確率。
- 錯誤護照 5 張：4 張沒有完整正確候選，1 張正確候選受 one-syllable-mismatch 阻擋。先前增加固定 ROI、拼音寬鬆 shadow、高品質插值沒有確認淨改善。**不重做**。

## 真正的新比較變因

候選：只將 **recognition** 從 `PP-OCRv5_mobile_rec` 替換為 `PP-OCRv5_server_rec`，保留 `PP-OCRv5_mobile_det`、目前兩個姓名 ROI、方向邏輯、MRZ 與姓名 selector 不變。官方 benchmark 的繁體中文 recognition 指標 server 高於 mobile，但資料集不同，不能預告此處會進步。

- 官方 PP-OCRv5 模型 benchmark：https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/algorithm/PP-OCRv5/PP-OCRv5.en.md
- 官方瀏覽器 SDK 自訂 model archive 格式：https://github.com/PaddlePaddle/PaddleOCR/blob/main/paddleocr-js/packages/core/README.md
- 主要候選模型：https://huggingface.co/PaddlePaddle/PP-OCRv5_server_rec （模型與推論格式必須先確認；此來源的 Paddle 原生參數不是可直接交給 SDK 的 ONNX tar）

## Gate 1：取得合法且可在瀏覽器載入的模型資產

- 不得把原生 `.pdiparams`、`.pdmodel`、`.tar.gz`、模型下載連結的 HTML 假裝是 `inference.onnx`。
- SDK 的自訂模型 URL 必須是**未壓縮 ustar .tar**，其中包含 `inference.onnx` 與 `inference.yml`；`inference.yml.model_name` 必須等於傳入的 `textRecognitionModelName`。先在本機使用：
  `cd frontend && node scripts/inspect-ocr-model-tar.mjs /path/to/PP-OCRv5_server_rec.tar PP-OCRv5_server_rec`
- 此工具僅檢查封裝結構、檔名及 model_name，不會上傳模型或讀取證件，**也不能證明 ONNX operator/runtime/字典相容**。
- 通過檢查後還要使用 SDK 獨立 `PaddleOCR.create` 建立候選、測 ONNX Runtime 在 WebGPU 與 WASM 的相容性，再進入真實 Validation。模型資產只在受控同源環境提供；確認授權、來源、checksum 與耗用記憶體。
- 尚未取得／驗證 browser-compatible server-rec ONNX tar。**不能跳過 Gate 1 就寫「A/B 已可以跑」**。

## Gate 2：受控 read-only A/B

- 新模型不得取代正式 `getPaddle()` 或覆寫 production 姓名；候選為 opt-in 實驗，獨立初始化與釋放。
- 保持同一份輸入照片、同一個 detection、preprocess、orientation 與 selector。若 SDK 不支援直接替換同一批已偵測文字框的 recognizer，就要明確標示 end-to-end 差異，不可歸因為僅 recognition。
- 先小規模合成圖 smoke test + 低規裝置初始化與記憶體測試，再使用合法 Validation 樣本。比較整張全欄、中文姓名 exact、原有正確樣本回歸、錯誤樣本救回、Median/P90 latency、峰值記憶體、啟動失敗。
- 按 Traveler 分組切分 Train/Validation；固定 Test baseline `2026.10.09.1` 不做重複調參。
- 匿名彙總；不寫入姓名、證號、raw OCR、影像、sample ID、逐張結果。不得用真實資料上傳 GitHub 或第三方 demo。

## Gate 3：正式採用門檻

- 護照中文姓名淨改善，原 14 張正確姓名不可發生不合理退步；台胞證 13/13 保持（因 production 沒動，仍需回歸檢查）。
- 如 server-rec 不改善，或初始化/延遲/記憶體代價不合適，保留現行 mobile。不要透過不斷調整 ROI 和 selector 偽造進步。
- 只有在候選真的具備可用 ONNX 資產與可靠對照後，才提高 pipeline 版號並要求使用者進行一次集中 Validation。

## 進度

2026-10-12 已完成 SDK API 與官方模型研究、建立本機 model tar structural preflight 及 synthetic tests，納入 `verify:ocr`。**尚無 server-rec 可用資產、沒有導入候選推論、未執行新模型 A/B**；production OCR 仍是 `.29`，最佳已實測為 `14/19 / 13/13`。

## 2026-10-12 — 官方 ONNX 模型來源已確認

官方 PaddlePaddle 在 Hugging Face 已發布 PP-OCRv5_server_rec_onnx：https://huggingface.co/PaddlePaddle/PP-OCRv5_server_rec_onnx/tree/main
內容含約 84.5 MB inference.onnx 與 inference.yml，授權 Apache-2.0。
官方 inference.onnx 頁面所列 SHA256：d9dc333c9c7b042c6dffb8e33d72b6f65c9c1d463d0a3c2f78174fea55e94752；下載後仍須在本地核對。

新增 frontend/scripts/package-ocr-server-model.mjs：在本地將官方 ONNX 與 YAML 封裝為 SDK 所需的未壓縮 tar；支援 model_name 為 PP-OCRv5_server_rec 或 PP-OCRv5_server_rec_onnx，必須用 YAML 真正的 model_name 初始化 SDK。
使用：cd frontend；node scripts/package-ocr-server-model.mjs <model-directory> <output.tar>；再用 node scripts/inspect-ocr-model-tar.mjs <output.tar> <actual-model-name> 做結構檢查。
新增 synthetic model packaging regression；模型二進位、私人證件及個資不提交 GitHub。
尚未完成實際模型下載、瀏覽器 SDK 初始化、ONNX 相容性或 A/B Validation。正式 OCR 仍 .29，不要現在重跑 32 張。

## 2026-10-12 — 可執行隔離模型啟動測試已接入（尚待本機運行）

新增 opt-in 官方模型下載器 `frontend/scripts/download-official-ocr-server-model.mjs`。只連接 PaddlePaddle 官方 Hugging Face，對 inference.onnx 比對官方 SHA256 `d9dc333c9c7b042c6dffb8e33d72b6f65c9c1d463d0a3c2f78174fea55e94752`，檢查 inference.yml model_name。
新增 `frontend/scripts/prepare-ocr-server-model.mjs` 一條命令完成下載、打包未壓縮 tar、結構檢查、建立本機 manifest，產物位於 `frontend/public/paddle-models/experiments/` 並由 gitignore 排除。模型資料約 85MB，不提交 GitHub。此命令需要網路、磁碟空間，且僅在操作者明確執行時下載。
可在 frontend 目錄執行 `npm.cmd run prepare:ocr-server-model`（Windows）或 `npm run prepare:ocr-server-model`（Linux/macOS），然後在本機啟動前端，至 OCR 品質頁面主動點擊「執行合成圖模型啟動測試」。
新增 `frontend/src/services/experimentalServerRecognition.ts`，用獨立 `PaddleOCR.create` 加載同源官方 ONNX candidate + 既有 mobile detection，只用 canvas 生成的假中文圖片，輸出初始化狀態、框數與執行時間；`dispose()` 釋放。**不讀取旅客照片、不覆寫 production OCR、不執行 32 張 Validation**。
合成測試成功只代表模型可在該瀏覽器與 SDK 執行，仍不是保證中文字正確或有實際提高護照姓名準確率。若實驗資產未準備則顯示提示，不允許降級成自動取用第三方雲端推論。
新增 synthetic packaging tests、來源與隔離 guard，納入 `verify:ocr`。正式 pipeline 保持 2026.10.11.29；所有實際 SDK smoke、模型下載、真實照片 A/B 尚未執行，不能寫成成功。

### 目前的下個驗收點

先由本機操作者執行一次 `npm.cmd run verify:ocr`、準備官方模型與前端 rebuild，再點合成圖 smoke。**只需回報是否成功初始化與耗時／錯誤分類**；不要求立即重跑 32 張。合成 smoke 成功後，才建立完整隔離 A/B 的準確率評估，避免重複無意義的 legacy Validation。

## 2026-10-12 — Server Recognition 合成 smoke：WebGPU MaxPool ceil_mode 不支援，已加 WASM fallback

使用者在瀏覽器按「執行合成圖模型啟動測試」，顯示 `ceil_mode output-shape is computed, but ceil_mode kernel execution (padding) is not yet implemented in the WebGPU MaxPool kernel`。這表示隔離模型初始化／執行遇到 WebGPU ONNX Runtime kernel 不支援；**不是模型 A/B 準確率結果**。main 已在 `experimentalServerRecognition.ts` 增加限定此錯誤的 fallback：auto 失敗且吻合 WebGPU MaxPool ceil_mode 時，重新用獨立 WASM backend、單執行緒、`/ort-wasm/` 初始化並用同一張 Canvas 合成文字執行；每個成功建立的 instance 都在 finally dispose。其他錯誤不隱藏、不盲目 retry。UI 顯示實際 backend、fallback 與耗時，並新增 static regression guard。正式 production PP-OCRv5 mobile pipeline 2026.10.11.29 未改，尚未在使用者本機測試 WASM 成功。下一次只需 pull、verify、frontend Docker rebuild、按合成圖測試；**不要跑 32 張 Validation**。禁止 GitHub Actions、個資和模型二進位上傳。

## 2026-10-12 — Server-rec 合成 WASM 執行成功，但原本 0 框統計讀錯 SDK 欄位

使用者最新合成圖 smoke 截圖顯示：WebGPU MaxPool ceil_mode 不支援後，WASM fallback **成功執行**，總耗時約 2963ms，但 UI 顯示辨識框數 0。檢查發現實驗程式原先讀 `rec_texts/texts`，而現行 PaddleOCR.js 在正式 `paddleOcr.ts` 中的實際使用方式是 `prediction.items`，故該 0 不可靠，不代表 Detection 失敗。已將隔離實驗改用 `prediction.items` 計算框數與擷取合成文字，UI 顯示實際 synthetic 文字（不含真實旅客資料），並補 regression guard。正式 production `.29` 不改；尚未確定合成字辨識正確，也沒有執行真實模型 A/B；下一步只需 pull、verify:ocr、frontend Docker rebuild、重新按合成圖測試，不要再跑 32 張 Validation。禁止 GitHub Actions 與個資上傳。

## 2026-10-12 — 官方 Server Recognition 合成圖實測成功

使用者本機 OCR 品質頁的隔離合成圖測試顯示：PP-OCRv5 server-rec ONNX 使用 WASM fallback 執行成功，辨識框 1，輸入合成文字「中文姓名 測試甲乙」與 OCR 輸出完全相符，總耗時 3552ms。WebGPU 仍因 MaxPool ceil_mode 不相容，使用 WASM。這證實候選模型在目前 SDK／瀏覽器至少能辨識合成中文文字，**不代表真實護照 A/B 的精準率改善**。

下一階段應在 Validation-only、匿名且 read-only 條件下建立 Mobile 與 Server 模型對照，隔離新模型 SDK instance、保持正式護照與台胞證 OCR 不變；記錄 exact-name、rescue/regression、P50/P90 及失敗原因。正式 pipeline 仍 2026.10.11.29，最佳已實測護照 14/19、台胞證 13/13；不得因合成測試成功就宣稱護照突破 74%。禁止 GitHub Actions，不上傳真實資料。

## 2026-10-12 — Server Recognition WASM 合成測試成功，隔離 Validation A/B 候選已建置

使用者瀏覽器已確認：官方 PP-OCRv5 Server Recognition ONNX 在 WebGPU MaxPool ceil_mode 不支援後切換 WASM，成功辨識 1 個合成文字框；輸入「中文姓名 測試甲乙」、輸出完全相同，總耗時 3552ms。此為 SDK / 合成圖相容性成功，不代表護照準確率已改善。

main 接續新增 `createServerRecognitionValidationInstance()`，由 `frontend/src/services/experimentalServerRecognition.ts` 建立獨立 WASM recognition candidate；OCR 品質頁新增「執行護照 Validation 模型 A/B」手動按鈕。只讀取 Validation 分組中的 PASSPORT，對同張影像分別透過現行 `recognizePassportWithPaddle` 及注入候選 instance 的同一護照解析函式運作，匿名統計 Mobile/Server 中文姓名正確、救回、退步、失敗及雙次推論 P50/P90。未進行個別結果持久化，未讀 Test 分組，不更改正式 Mobile pipeline；候選 instance 結束時 dispose，允許安全停止後續樣本。增加 `test-server-recognition-ab.mjs` 靜態守衛並納入 `verify:ocr`。

**本次 A/B 程式碼已提交，但未在使用者 Windows 完整 build 或實際 Validation 跑過**。先執行 `npm.cmd run verify:ocr`、Docker frontend rebuild，再由 OCR 品質頁手動啟動護照 Validation A/B，截圖匿名結果。此比較會多佔記憶體且總耗時較久；數據是同一流程不同 recognition 模型的 end-to-end 比較，而不是完全孤立的 recognition token 比較。若沒有淨改善或明顯回歸，禁止切換正式 OCR。正式 pipeline 仍 .29，基準護照 14/19、台胞證 13/13。禁止 GitHub Actions，不上傳個資及模型二進位。

## 2026-10-12 — 護照模型 A/B 主執行緒卡死，先改 Worker＋單張安全驗證

使用者在本機執行 Validation Mobile vs Server Recognition 的19張 A/B，跑到約 2/19 時瀏覽器顯示「網頁無回應」，即使等候也無法恢復。**這次 A/B 不算有效完成，無任何可靠準確率數字**。原因尚未用 profiler 定位；現有 Server WASM 大模型及 Mobile OCR 都在原本瀏覽器執行，可能阻塞主執行緒且造成記憶體壓力。

已直接修正 main：隔離 Server Validation instance 的 PaddleOCR.create 加上 SDK 已支援的 `worker: true`，WASM 繼續單執行緒，保持正式 OCR 不變；實驗 UI 暫時限每次手動只跑 **1 張 Validation 護照**，不允許再一次跑19張。新增 Worker 與樣本上限的 regression guard，仍只顯示匿名總和。不代表整段 pipeline 已搬離主執行緒（Mobile baseline 與 parser 仍在主執行緒）；若單張繼續卡住，立即停止這條 UI 路線，需進一步將整段比較移至 Worker 或服務端隔離環境。這次修改尚未本機 build / runtime 驗證成功；**不得聲稱已解決網頁無回應**。先 pull、verify/build，再點單張安全測試，不需要下載模型或跑32張正式 Validation。禁止 GitHub Actions、真實證件資料上傳 GitHub。

## 2026-10-12 — 單張 A/B 仍卡在 1/1：修正 Mobile 主執行緒遺漏

使用者已更新先前 Worker／單張安全模式，但畫面仍停在「護照 Validation 1/1」，沒有完成比較。進一步查碼確認上一版只有 Server instance 使用 `worker: true`；Mobile 比較基準仍是 `recognizePassportWithPaddle(file)`，依賴 production 主執行緒 SDK。這是單張仍可能卡住的重要架構缺口，尚不能斷定唯一成因。

本批已修正 OCR 品質頁的 Validation-only A/B：Mobile 改由 `createValidationPaddleInstance(true)` 獨立 WASM Worker 執行，取得結果後先 dispose、釋放資源，再初始化 Server 的 WASM Worker、執行同一張照片，最後 dispose。避免兩組大型模型同時佔用記憶體；正式 production OCR 完全不變。新增啟動 Mobile、推論 Mobile、釋放 Mobile、啟動 Server、推論 Server、釋放 Server 逐階段提示，更新 regression guard。單張限制仍保留，不執行 19 張或 Test cohort，不持久化姓名與 OCR 原文。

**修正尚未經 Windows build 或瀏覽器 runtime 證實。** 若再次無回應，應停止同種主頁推論測試，改設計完全可中止的隔離工作流程；目前停止按鈕只能停止後續樣本，不能強制終止目前同步卡住的 OCR。基線仍 `.29` 護照 14/19、台胞證 13/13；GitHub Actions 禁止執行。

## 2026-10-12 — Mobile / Server Worker 單張 A/B 首次完整成功；下一張游標

使用者本機完整跑完安全單張的 Validation 護照 Mobile / Server Recognition：比較 1 張，Mobile 中文姓名正確 1、Server 正確 1、救回 0、退步 0、錯誤 0；兩模型合計執行時間 57,455 ms（單張 P50/P90 均此值，不能視為各模型獨立 latency 或完整 Validation 指標）。此前網頁無回應問題此次未再發生。仍無證據表明 Server 比 Mobile 準確。合成字測試仍為 WASM 1 框正確。

在 main 新增 session-only 單張 Validation 護照游標：每次人工按一次才跑一張，完成或計入錯誤後移到下一張，不再永遠重測第一張；重新整理頁面時游標會重置。保留雙 Worker 先後運行、匿名合計、只讀 Validation、不動 Test 與正式 OCR；測試守衛更新。尚未在 Windows build 驗證這項游標變更。下一步先由操作者驗證游標與單張運行穩定性，不要求一次跑 19 張。若要針對剩餘姓名錯誤樣本精準評估，應建立更有效率的基線／候選關聯與隔離測試設計，不能聲稱單張已驗證改善。正式 pipeline `.29`，護照 14/19、台胞證 13/13。禁止 GitHub Actions，不上傳證件個資。

## 2026-10-12 — 單張模型 A/B 優先取歷史姓名錯誤樣本（待本機驗證）

上一輪 Worker 隔離的實際 Validation 單張比較成功：Mobile 正確 1/1、Server 正確 1/1、救回 0、退步 0、錯誤 0，兩模型累計耗時約 57,455ms。這張本來就已正確，不能用以證明 Server 較好。正式 production OCR 仍 .29（固定 Validation 護照 14/19，台胞證 13/13）。

main 現將單張 A/B 的選樣改成：只讀 Validation PASSPORT，依既有 `evaluationBaselineJson.fields.nameZh` 與人工 ground truth 進行 **匿名優先排序**；先選歷史 baseline 中文姓名不正確的護照，之後才是其他樣本。這只是排序 proxy：歷史 baseline 可能不同於現在的 .29，因此沒有直接假設這五張就是 .29 的五張錯誤，也不以 baseline 代替真正比較結果。選中的同一張仍依序在隔離 WASM Worker 跑 Mobile 及 Server，並以當次結果判斷 rescue/regression；每次最多一張、完成後 session 游標前進、不觸及 Test、不儲存個資、不中途改寫正式 OCR。UI 標示「歷史 baseline 疑似錯誤」或「一般／無歷史錯誤證據」。新增 static regression guard，尚未完成 Windows build 或實際執行。

**效能瓶頸仍存在**：單張兩模型約 57.5 秒，排序只能提高測試資訊價值，不會降低單張模型推論成本。不要直接回到連續 19 張模式；未來需另行改善模型初始化／耗時隔離與 Worker 強制中止能力。GitHub Actions 禁止執行，真實證件圖片、姓名、證件號不提交 GitHub。

## 2026-10-12 — 分開記錄 Mobile / Server Worker 耗時（待本機驗證）

單張模型 A/B 現在額外顯示 Mobile 與 Server 各自包含 Worker 初始化、推論及 dispose 的總時間；保留原本兩模型合計 P50/P90。該數據可判斷 57 秒主要來自哪個模型，但**不等同純 Recognition latency**。已新增 regression guard；正式 pipeline `.29` 不變、只使用 Validation 的單張護照、不新增 OCR inference。本批程式尚需 Windows `verify:ocr`、Docker frontend build 與手動單張 A/B 確認。禁止 GitHub Actions 或任何證件資料上傳。

## 2026-10-12 — Server-rec 單張 A/B 實測與歷史 baseline 覆蓋稽核

使用者完成一張 Validation 護照的雙 Worker 對照：Mobile 正確 1/1、Server 正確 1/1、救回 0、退步 0、錯誤 0。Mobile 含初始化與釋放 8,589ms，Server 含初始化與釋放 47,208ms，兩模型合計 55,796ms；這不是純辨識延遲。UI 顯示樣本 1/19「一般／無歷史錯誤證據」，因此目前的歷史 baseline 優先排序沒有證明能選中最新版 .29 的錯誤護照；不得聲稱 Server 準確率提升。

為避免再次昂貴盲測，已在 OCR 品質頁新增可手動執行的「先檢查匿名歷史基準覆蓋率（不執行 OCR）」：只檢查 Validation 護照人工答案與已存 evaluationBaselineJson，匿名統計有 baseline、歷史姓名錯誤、歷史姓名正確、無 baseline、無人工姓名答案的件數，不載入圖片、不跑任何 OCR、不存個資；並更新回歸守衛。需在本機 verify/build 後先執行此稽核，據結果決定下一步，不要直接重跑 19 張或盲測 Server。Production pipeline `.29` 不變，GitHub Actions 禁止執行。

## 2026-10-12 — 19/19 baseline 缺失，改用本頁即時 Validation 暫存錯誤集合

使用者的匿名稽核顯示：19 張 Validation 護照中，可解析歷史 baseline 0、缺少 baseline 19、缺少人工姓名答案 0。故先前「歷史錯誤優先」沒有證據可用。上一張 Worker A/B Mobile 與 Server 都正確，沒有救回與退步，兩模型耗時超過 56 秒，不能代表 Server 提升辨識率。

已在 main 新增 session-only 記憶體集合：當本頁正式 production Validation 完整完成且沒有 OCR 失敗時，從該次逐張比對結果留下中文姓名判錯之樣本 key（非姓名、證號或 OCR 原文）；A/B 優先選該次失敗，再考慮歷史 baseline。若 Validation 中止、失敗或不是 production 模式便不用此集合。重新整理即清空，不寫資料庫、GitHub 或本機持久儲存；仍每次只跑一張、使用雙 WASM Worker。

注意：既有 .29 的 14/19 聚合結果無法反推五張失敗樣本；本次改碼不能自動還原舊索引。只有同一頁再完成一次正式 Validation 才能形成精確錯誤排序。已加入靜態回歸守衛，尚待本機 verify/build。正式 production OCR .29 不變，台胞證基準 13/13。不啟動 GitHub Actions、不上傳真實證件與個資。

## 2026-10-12 — 限定已驗證錯誤護照的單張 Server A/B

歷史 Validation 護照 19 張可解析 baseline 為 0，故不能用歷史錯誤排序。更新 main：未在同一頁完整完成 production Validation 時，模型 A/B 按鈕停用；成功且沒有 OCR 失敗時，僅用本頁記憶體中的姓名判錯樣本 key 集合輪流進行單張 A/B。索引不持久化，刷新頁面即失效。不再盲測原本正確的護照。沿用獨立 Mobile/Server WASM Worker，正式 OCR pipeline .29 不變。已更新靜態守衛，尚待本機 verify/build。禁止 GitHub Actions 與真實個資上傳。

## 2026-10-12 — .29 Validation 錯誤索引成功，Server A/B 第一張無救回

使用者本機正式 auto Validation 完成 32/32：護照中文姓名及整張 14/19（74%），台胞證整張 13/13（100%），失敗 0；當頁建立 5 張護照姓名錯誤的 session-only 索引。隔離 Worker A/B 正確選中第一張錯誤護照（1/5）；Mobile 中文姓名 0/1、Server 0/1、救回 0、退步 0、錯誤 0。Mobile 含初始化／釋放 11,402ms，Server 63,145ms，總 P50/P90 74,547ms；每個時間是全流程開銷，不是純 recognition latency。此一筆不能推論其餘四張是否可救回，也不能升級正式模型。候選模型目前 WASM 耗時偏高；應保留安全單張模式並研究更有效率的 recognition-only 對照，不再做盲目全樣本連續運算。當頁索引刷新會消失，不保存姓名或證件資訊。正式 .29 未修改。禁止 GitHub Actions 和上傳個資。

## 2026-10-12 — 已驗證錯誤護照改用 Server-only 救援實驗（待本機測試）

先前本頁正式 `.29` auto Validation 完成 32/32，護照 14/19、台胞證 13/13，建立 5 張護照姓名錯誤的暫存索引；第一張雙模型 A/B Mobile 和 Server 均錯，救回 0。Mobile 含啟動釋放 11,402ms、Server 63,145ms，雙模型 74,547ms。

本批只改研究實驗：由於同頁正式 Validation 已驗證所挑選的護照姓名錯誤，因此不再在昂貴的救援試驗中重複初始化 Mobile Worker；只執行 Server WASM Worker 並與同頁 `.29` 判錯及人工 ground truth 比對。每次仍只跑一張已驗證失敗的 Validation 護照，若 Server 正確則計候選救回。UI 明確標示此為「正式 auto 已判錯 vs Server WASM」的跨 backend 對照，不能等同兩模型在同一 backend 同時重跑的嚴格 A/B。安全索引同頁暫存、刷新消失；模型和文件照片不提交 GitHub。正式 OCR pipeline `.29`、台胞證、固定 Test 完全不變。已更新 synthetic/static regression guard，尚未 Windows verify/build 或實測；Server 耗時瓶頸仍需另行研究。禁止 GitHub Actions。

## 2026-10-16 — 最新決策摘要
現行與淘汰模型總覽改以 docs/OCR_CURRENT_STRATEGY.md 為準。正式 .29 仍為護照 14/19、台胞證 13/13。v6 Small 在四張缺候選樣本產生一張新 exact candidate，但使用當次 .29 MRZ 與正式 comparator 時仍是 0 對、2 錯，因此不安全，不准自動上線。PP-OCRv5 Server / Tesseract chi_tra / 歷史英文整串拼音停止繼續盲測。下一實驗先取得五張失敗的匿名根因分桶與影像品質檢查，別再反覆放寬 selector；沒有新 Validation 實測，不能聲稱有增益。

## 2026-10-16 — v6 停止盲測，優先分離失敗成因
新增頁面匿名多 crop 失敗證據統計，分辨是否曾出現完整正確字串、其他候選、沒有候選及 selector 阻擋。這是重疊的觀察性分類，非 Detection/Recognition 真因標籤。暫不選新 OCR 模型；先用正式 Validation 驗證實際有用的證據分佈，再依缺失決定可驗收的方案。新的 v6 輸出及拼音 gate 曾有兩張錯選，禁止自動採用。

## 2026-10-16 — PP-OCRv5 三個單字框候選（待驗收）
新優先項不是換模型：在現有 Mobile OCR 高信心單字框有姓名標籤／拉丁框錨點時，嚴格拼接三個框產生完整 MRZ-compatible 中文姓名；原本選取器有有效候選則不採 fallback。此為文字框組合假設，目前沒有證據證實四張缺候選樣本有這種形態。需要本機靜態與 build + 完整 32 Validation 和錯選監控；若無增益即停止，不得將 shadow / 候選命中視作真正正確率。

## 2026-10-16 — 下一個模型 A/B 的必要證據：raw OCR 逐字覆蓋
先在固定 19 張護照 Validation 的 5 張姓名錯誤中分別統計 raw OCR 有多少張全部漢字出現、部分出現、零出現。全部存在不代表正確順序／姓名區域；部分或零存在才更支持 recognition 或影像問題。必須先實測，不能繼續盲調拼音、字框或上線 v6 錯選 fallback。若未找到真實收益，正式 .29 不變。

## 2026-10-16 — 三框混合 3–4 字 fallback 實驗
模型不變，擴充 PP-OCRv5 Mobile 三框候選至可能的 1+1+2、2+1+1 拆框。嚴格 MRZ、位置、信心和唯一性不變。驗收以全部正式 Validation 的真實姓名整張正確率與錯選數；未確認錯誤四張有這種拆框。若 14/19 仍不動，停止這條規則路徑，改投入獨立 recognizer 或影像品質。

## 2026-10-16 — 取消三框混合長度方案的後續投入
實測正式 32 Validation（護照 14/19，台胞證 13/13）確認 D-095 1+1+2 等三框候選修訂沒有增益。將其標記為「無收益、停止後續幾何微調」，不再以同一固定集無止境調參。下輪方案需有新的 recognition 來源及真正不同的失敗證據：比較離線有無正確字串、運行成本、錯誤自動候選率，確認後才導入瀏覽器。
