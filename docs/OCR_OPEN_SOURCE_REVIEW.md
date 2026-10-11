# V2 OCR 開源技術評估清單（2026-10-10）

> **研究文件，不是正式導入決策。** 不修改 OCR 主流程、parser、orientation threshold、baseline 或固定 Test 資料。後續所有 OCR 調整依 `docs/DECISIONS.md` D-072 執行。

## 現有實作（以 main 原始碼核對）

- `frontend/package.json` 已安裝 `@paddleocr/paddleocr-js ^0.4.2`；`frontend/src/services/paddleOcr.ts` 已採 PP-OCRv5，模型走同源 `/paddle-models`，有初始化快取、旋轉、多次辨識與透視相關幾何演算法。
- `frontend/src/services/ocr.ts` 已實作護照 MRZ 解析、檢查碼、有限字元修復；`frontend/src/services/taiwanPermitMrz.ts` 另處理台胞證 MRZ。
- `frontend/src/services/nameScriptConversion.ts` 有單字元簡轉繁字典，對多義字保留人工確認。不可因導入新的簡繁工具就自動覆寫正式證件姓名。
- 正式 OCR pipeline 版本仍為 `2026.10.09.1`。不能因發現開源專案就推測現有系統尚未採用，或直接更新。

## 可借鏡的開源專案

| 候選 | 上游 | 已有 / 可研究 | 邊界 |
| --- | --- | --- | --- |
| PaddleOCR.js（官方） | https://github.com/PaddlePaddle/PaddleOCR/tree/main/paddleocr-js | **已採用**。研究官方 `worker: true`、多圖 `predict(images[])`、預熱、metrics、WASM/WebGPU 支援 | 先驗證效能及模型相容。不要直接升版或重寫 |
| OpenCV.js Document Scanner | https://github.com/tony-xlh/opencvjs-document-scanner | 比較邊界定位與透視裁切，尤其身分證、台胞證斜拍照片 | 現有系統**已有**相關幾何處理；只做 A/B 比較，不直接替換 |
| `mrz`（cheminfo） | https://github.com/cheminfo/mrz | TD1/TD2/TD3、check digits、自動字元校正，可作**獨立參考實作 / 測試 oracle** | 不取代已驗證的 TD3 / 台胞證 parser。auto-correct 必須經 checks 與人工審核 |
| OpenCC.js | https://github.com/nk2028/opencc-js | 台灣繁體 `cn → tw`，與現有一對一字典比較人名轉換覆蓋率 | 姓名同字異義與異體字可能誤轉；不得用語言轉換結果直接改寫已確認身份 |
| ONNX Runtime Web | https://github.com/microsoft/onnxruntime | 官方 runtime 的 WASM、WebGPU 效能與設備相容性比較 | 正式流程已有 SDK 內的 ORT，不應另疊一套重複 runtime |

## 優先實驗順序

1. **OCR 偵測 / 透視校正：** 用經同意、已覆核且按 Traveler 分組的 Train/Validation 照片，分析失敗是邊界偵測、旋轉、裁切還是文字辨識。比較現有方法與 OpenCV.js 的裁切，保留原始全圖 fallback。不要只以單張成功率決策。
2. **效能：** 不更動辨識答案。用官方 PaddleOCR.js 文件的 Worker、batch 及 ORT runtime 設定，獨立分支測冷啟動、熱啟動、平均/P90 延遲、峰值記憶體及 UI 凍結。分別在低規電腦、一般桌機與 Chrome/Edge 測試。批次推論須留意多圖記憶體。
3. **MRZ 參考測試：** 將 `mrz` 當對照 parser，在合成、不含個資的 TD3/TD1/TD2 測試案例比對 check digits、欄位正規化和 false-positive。正式護照 parser 不因套件結果不同就直接改寫。
4. **簡繁姓名：** 與 OpenCC.js 比對人工確認過、可合法使用的**人名**；評估漏轉、誤轉、一簡多繁、同音不同字。輸出只做提示，不自動定案。
5. **是否導入：** 評估授權、套件更新、鎖版、模型下載來源、同源資源託管、離線可用性、額外初始化及記憶體成本。

## 資料與評估規則（不可跳過）

- 正式護照、身分證、台胞證原圖與 private Training Dataset **不得傳上 GitHub**、第三方 demo 或未受控外站。若候選需要雲端推論，與目前 V2 瀏覽器端 OCR 政策不符，不直接採用。
- 調整 OCR 的實驗只使用 Train/Validation。依 Traveler 分組，避免同一真人跨 split。固定 Test baseline `2026.10.09.1` 不作反覆調參工具。
- 比較不能只看整體 OCR 字元率；必須看**各必要欄位 exact-match、整張全對率、人工修正率、MRZ 檢查碼通過率、速度與 UI 卡頓**，並按證件類別分開。
- 候選改版需在**獨立 branch** 完成，可重現、可回滾，基準通過後才考慮合併正式 OCR。
- 任何開源程式碼、模型、字典需核對具體版本及授權，再更新 `THIRD_PARTY_NOTICES.md`。

## 已確認來源

- PaddleOCR 瀏覽器官方文件：https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/inference_deployment/cross_platform/browser.en.md
- PaddleOCR.js 架構與 Worker 注意事項：https://github.com/PaddlePaddle/PaddleOCR/blob/main/paddleocr-js/docs/architecture.md
- OpenCV.js Document Scanner：https://github.com/tony-xlh/opencvjs-document-scanner
- `mrz`：https://github.com/cheminfo/mrz
- OpenCC.js：https://github.com/nk2028/opencc-js
- ONNX Runtime Web：https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html

## Validation 對照實驗：第一階段效能量測

功能位置：`OCR 品質` 頁面 **Validation OCR 效能實驗**。按鈕需操作人員手動點擊，且只在 Validation 樣本數大於零時可執行。

- 只呼叫 `getTrainingEvaluationSamples('validation')`。不 reserve fixed Test、不寫入 evaluation baseline、不寫 benchmark runs、不執行 training selection。
- 逐張調用**既有**正式 `currentFieldsForSample()` 與 OCR pipeline，不裝其他 SDK、不修改模型或辨識參數。
- 評估項目：整張必要欄位完全正確率、模型預熱 elapsed time、pipeline Median/P90、呼叫總耗時 Median/P90、影像 fetch Median、方向重試率、成功/失敗張數；三種證件各自計算。
- 若已經在同一瀏覽器頁面跑過 OCR，預熱會短很多。**預熱數字不等同冷啟動時間**；冷啟動需使用全新瀏覽器 session / 新載入的隔離環境再測。
- Validation API 預設回傳「曾保存的實際 OCR 工作影像」，舊樣本缺少時才回傳審核原圖。畫面會列出各類有 exact OCR input 的張數；不能混淆兩群結果。
- 可點「停止後續樣本」。停止時只在**目前執行中的這張**完成後中止；畫面顯示部分樣本結果，不視作完整 run。
- 顯示**聚合資訊**，不呈現也不寫出任何姓名、證件號碼、照片、sample ID 或逐張文字。重新整理頁面即清除這次結果。
- 不測 Worker / WebGPU 或新透視算法；這是用於後續可重現 A/B 的**既有流程參考值**，不是已完成效能優化的證據。

驗收：前端 type-check/build、read-only static guard、既有 PostgreSQL CI 全過。實際效能數值必須由本機操作者用有權使用的 Validation 樣本跑出，**不能用 CI 合成圖片推定真實準確率**。

## Validation 第二階段：SDK Worker 執行環境 A/B（實驗）

只增加可選的獨立 SDK 執行環境。**正式掃描仍呼叫原有 `getPaddle()`，版本仍為 `2026.10.09.1`。**

在「OCR 品質 / Validation OCR 效能實驗」可選三種模式：

1. 正式 auto：原本的 `getPaddle()` pipeline，使用 `backend: auto`，與 production 一致。
2. 獨立 WASM 直接模式：同一 PP-OCRv5 模型，`backend: wasm`、`numThreads: 1`，只供對照。
3. 獨立 WASM Worker 模式：相同模型和 `backend: wasm`、`numThreads: 1`，額外設定 `worker: true`。Worker 用完即呼叫 `dispose()`。

**因果對照只能比較第 2 與第 3 種。** 正式 auto 可能選用不同 runtime，不能把與 Worker 的速度差全歸因於 Worker。三種模式都沿用既有 parser、orientation、必要欄位擷取、輸入樣本及 exact-match 邏輯。

依官方 PaddleOCR.js SDK 文件，Worker 模式需要明確的 ONNX Runtime Web WASM 資源位置。前端 `npm ci` 時 `postinstall` 將**已安裝版本** `onnxruntime-web/dist` 的 WASM 複製到 `frontend/public/ort-wasm`（gitignore），經 Vite build 與 Docker nginx 託管在本機 `/ort-wasm/`。這只是載入執行程式，圖片仍在 V2 的自家後端與瀏覽器範圍內。不可改為向 CDN 傳送證件影像。

限制：
- CI 可驗證編譯、WASM 資產與 endpoint，但**不能代替**真實瀏覽器 Worker 啟動及各張 Validation 文件實測。
- 主模式與 Worker 可能同時佔記憶體；大型資料批次宜先以少量樣本試跑，必要時停止並重新整理。
- 每個模式的聚合結果暫存在頁面，重新整理即清除。中途停止的結果不能當完整 A/B。
- 如瀏覽器不支援該 SDK Worker bundle、Worker 無法載入，保留正式流程不變，並回報錯誤；不靜默把 Worker 結果當成直接模式。
- 若 A/B 效能沒有改善，或三種證件任一必要欄位出現回歸，則不推進到正式掃描。

## 2026-10-10：第一輪 Validation 實測及解讀限制

這是操作人員透過 OCR 品質頁面截圖提供的**單次、特定瀏覽器環境**觀察值，不是經外部獨立驗證的效能報告：

| 模式 | 護照（19 張） | 台胞證（13 張） |
| --- | --- | --- |
| 正式 auto | 整張全對約 37%，Median 1.4 秒 | 整張全對約 38%，Median 1.1 秒 |
| 獨立 WASM Worker | 整張全對約 37%，Median 7.8 秒 | 整張全對約 31%，Median 5.8 秒 |

兩模式均顯示成功完成 32 張、失敗 0 張；當時未提供獨立 **WASM direct** 模式結果，因此不能把與正式 auto 的差異歸因於 Worker 本身。

**重要限制：上述兩模式皆為「保存當時 OCR 工作影像 0/19 護照、0/13 台胞證」。** 這批 Validation 全為缺少當時 OCR 實際輸入圖的舊樣本；API 以當時的審核圖像取代，因此上述準確率僅能作影像回歸參考，不能直接代表新上傳時的完整前處理與辨識能力。並且身分證 Validation n=0，無法推論其表現。

截圖另顯示一筆「Validation 讀取或 OCR 預熱失敗」及進度 0/32，但頁面仍同時顯示過去完成的 Worker 與 auto 卡片。這是實驗結果暫存在記憶體且錯誤訊息沒有明確標示**本次失敗與上次成功結果不同**；不能把舊卡片當作最新一次成功。新增 UI 修正會：
- 每個成功的摘要加上完成時間；在執行時明確註明下方為舊結果；
- 本次讀取／預熱／辨識失敗時標示階段與模式，顯示舊卡片並明確說明非本次結果（不顯示任何證件個資）；
- 顯示缺少 OCR 工作圖的張數與非完整 pipeline 結論；
- 在內存統計各必要欄位 exact-match 率，幫助辨識是姓名或其他欄位造成整張失敗；不存任何逐張值。

接下來須補 **WASM direct** 實測，確認是否仍有 Worker 初始化失敗或 WASM 延遲差異；真正 OCR 精準度優化應先蒐集保有確切 OCR 輸入影像的 Validation 樣本，不使用 fixed Test 反覆調參。

## 2026-10-10：Worker 初始化 0/32 — 遺漏 ORT 動態載入模組

在本機 `localhost:5173`（Vite dev）實測 Worker 時，SDK 在 OCR 預熱階段回報：
`no available backend found [wasm]`，
`Failed to fetch dynamically imported module: /ort-wasm/ort-wasm-simd-threaded.jsep.mjs`。

**根因：** `frontend/scripts/copy-ort-wasm.mjs` 只複製 `node_modules/onnxruntime-web/dist` 中的 `.wasm`，但 ONNX Runtime Web 版本的 WASM backend 需要先動態載入與版本匹配的 `.mjs` JavaScript loader。沒有該 loader 時，即使 `.wasm` 檔案正常，瀏覽器仍無法初始化 WASM backend。過去 CI 只檢查 `.wasm` 是否存在，漏測了這個部署需求。

**修正：**
- 由已安裝的 `onnxruntime-web/dist` 同時複製 `ort-wasm-*.wasm` 與 `ort-wasm-*.mjs`，並在安裝時檢查必須存在 `ort-wasm-simd-threaded.jsep.mjs`；不使用其他版本 CDN。
- Docker 的 nginx 為 `.mjs` 明確設定 JavaScript MIME，避免被瀏覽器因 `application/octet-stream` 拒絕；不含 hash 的模型 runtime 檔案使用 `no-cache, must-revalidate`，避免新舊版本共用快取。
- CI 增加 Vite 開發模式以及 Docker nginx 的 `.mjs` HTTP 200 / MIME / bytes 檢驗，及動態 loader 在 dist 中存在的檢驗。

**本機更新注意：** `git pull` 只更新複製腳本，不會再次觸發舊的 `npm ci` postinstall。若沿用既有安裝，須在 `frontend` 目錄執行 `node scripts/copy-ort-wasm.mjs` 一次，並重新整理網頁。新環境執行 `npm ci` 時會自動複製。

CI 可證明 loader 檔案被正確託管，但不能代替瀏覽器 Worker 完整初始化實測，亦不代表 Worker 比正式 auto 更快。此修正不變更辨識模型、parser、threshold、fixed Test baseline 或任何個資。

## 2026-10-10：三模式 Validation 完整實測後的優先順序

操作人員在同一個環境跑完 32 張（護照 19 張、台胞證 13 張），所有模式均完成 32/32、失敗 0。這次三種模式的完整比較如下：

| 指標 | 正式 auto | WASM 直接（單執行緒） | WASM Worker（單執行緒） |
| --- | --- | --- | --- |
| 護照整張全對 | 37% | 37% | 37% |
| 台胞證整張全對 | 38% | 31% | 31% |
| 護照 Median | 1.4 秒 | 7.9 秒 | 8.9 秒 |
| 台胞證 Median | 1.0 秒 | 5.9 秒 | 5.8 秒 |
| 護照中文姓名 exact | 37% | 37% | 37% |
| 台胞證中文姓名 exact | 46% | 38% | 38% |

這些是單次截圖觀測值，不做顯著性宣稱；**三模式保存的當時 OCR 實際工作影像均為 0/32**，用現存審核影像代替，故不可宣稱為正式完整上傳準確率。

初步結論：

- Worker 沒有比相同 WASM backend 的主執行緒更快；不推進正式掃描。
- 正式 auto 比兩個強制 WASM 實驗快很多；不能僅根據耗時推論一定採用 WebGPU，需在 Validation 顯示 SDK `getInitializationSummary()` 的偵測／辨識 provider。
- 這批護照除了中文姓名（37%），其餘已評估必要欄位均 100%；優先釐清中文姓名取不到、讀錯或被候選選擇器忽略的比例。
- 台胞證的中文姓名與性別也有失敗，不能用調高或降低一個共用 threshold 盲目修正。
- 透過既有 `chineseNameDiagnostics`，在 Validation 過程只留**分類計數**（未選中、候選錯誤、沒有候選），不保留辨識文字、正確姓名、檔名或影像。分類僅代表特徵層推測，無法證明圖像偵測還是模型認字問題。
- 先追加「有完整 OCR 輸入工作影像」的 Validation，再基於匿名分類進行最小幅度候選策略實驗；固定 Test baseline `2026.10.09.1` 持續凍結。

**此 PR 僅補充 read-only provider / Validation 診斷，不更動正式 OCR、parser、runtime backend 與模型。**

## 2026-10-10：WebGPU 實際 provider 與姓名診斷精細化

新一輪正式 auto Validation（護照 19、台胞證 13）：
- SDK 初始化回報 detProvider = `webgpu`、recProvider = `webgpu`，實證當次正式 auto 走 WebGPU；不代表任何電腦都會用 WebGPU。
- 護照中文姓名：19 張中 7 張完全正確、12 張錯誤。舊報告把錯誤分類為「正確但未選中 7、其他候選錯誤 5、無候選 0」，台胞證中文姓名 46%、性別 77%。
- **舊「正確但未選中」的 7 張不能直接視為 selector 可修復：** 原算法只要 `candidateTexts` 包含正確姓名，或 `rawTexts` 的任意一行**包含**正確姓名，就歸在同一類；較長的 OCR 行（例如標籤與姓名連在一起）包含姓名並不代表完整、符合位置及拼音條件的候選存在。

後續 Validation-only 診斷拆成五組，優先順序如下：
1. 候選文字完整相符（但不保證符合 selector 的排版／拼音 eligibility）。
2. 原始 OCR 行完整相符。
3. 只有較長 OCR 行包含正確姓名片段（非完整候選，不應直接稱 selector miss）。
4. 有候選但皆不符。
5. 沒有候選。

分類順序互斥，合計必須等於中文姓名錯誤數；只保留聚合張數，不保留影像、姓名、逐張真值或檔名。**這份分類改進尚未改動正式的 `chooseTaiwanChineseName()`。** 下一次依照重新取得的 Validation 摘要評估是否值得設計 shadow selector 比較；不從既有固定 Test 進行調參。

現有 32 張仍全部缺少「當次真正 OCR 工作圖」；這是 legacy 回歸樣本，不能以此推論正式上傳端到端準確率。

## 2026-10-11：Validation 五分類實測 — 7 張完整候選但未選中

使用者提供正式 auto（WebGPU）Validation 畫面。測試在畫面上標示 2026/10/11 01:00，結果為護照 19 張、台胞證 13 張，兩者合計 32/32 完成、失敗 0。未測身分證。SDK detProvider / recProvider 均為 WebGPU；這只是當次裝置環境。

**護照（19 張）**
- 整張完全正確 37%（7/19）；中文姓名 37%；英文姓名、生日、性別、國籍、證件號碼、簽發國、有效期限均 100%。
- 中文姓名 12 張錯誤，其中「候選文字完整吻合」7 張、「原始 OCR 行完整吻合」0 張、「僅在較長 OCR 行包含姓名」0 張、「其他候選但內容不符」5 張、「無可用候選」0 張。
- Median 1.4 秒、P90 2.2 秒；方向重試率 0%。

**台胞證（13 張）**
- 整張完全正確 38%；中文姓名 46%；出生日期 100%、性別 77%、證件號碼 100%、有效期限 100%。
- Median 1.0 秒、P90 2.8 秒；方向重試率 15%。

**限制及結論**
- **OCR 工作影像保存數仍為 0/19、0/13**；全部以保存的審核影像替代，不代表真實端到端上傳準確率。
- 7 張的正確中文姓名**完整存在於候選清單**，不是 substring 誤分類。但 Validation 診斷沒有保留每個候選的版面位置、score、羅馬拼音狀態或是否符合 selector 的 eligibility，因此不能斷言只改排名就能救回 7 張。
- 原程式 `chooseTaiwanChineseName()` 依賴姓名欄位／英文姓名幾何 anchor、OCR confidence 與 MRZ 羅馬拼音狀態。可能原因包括：候選沒有進入 spatial/direct eligible、被 conflict 過濾、被排名較高的錯誤候選勝出、confidence 不足、unknown 門檻。這些目前均為**待檢驗假設**，不得寫成已確認根因。
- 下一步優先做 read-only **shadow selector decision trace**，比較舊 selector 與候選 eligibility/排名各階段的匿名原因計數，不在正式掃描套用新的選擇器。只保留聚合計數，不上傳真名、原始 OCR 字串、證號與影像。先評估 7 張的潛在回收率及是否引發既有正確 7 張回歸。
- 固定 Test baseline `2026.10.09.1` 仍凍結；不拿 Test 反覆調參。


## 2026-10-11：候選選擇器 shadow decision trace（實驗）

為追查 7 張中文姓名完整候選未輸出的原因，在 `chooseTaiwanChineseName()` 增加可選 observer，記錄候選是否缺少 spatial/name anchor、MRZ romanization conflict、confidence 門檻、unknown 門檻或排名較低。原 selector 排名／返回值不變；Validation 用人工 truth 在瀏覽器當次比對，僅將**匿名原因張數**留在本頁聚合結果。候選文字不寫進資料庫或 GitHub。

注意：同張照片可能有不同 crop 或方向的診斷；此階段分類不等於可以直接救回的數量。需先本機測試並核對分布。固定 Test baseline 保持 `2026.10.09.1`。

## 2026-10-11：Shadow selector 找到拼音衝突集中點

新一輪正式 auto Validation 截圖顯示護照 n=19 的中文姓名錯誤 12 張，其中「完整正確候選 7 張」在影子決策追蹤全被分類為 `romanization-conflict`。不是 7 張都沒有 OCR 辨識出正確文字；也**不代表 7 張都是拼音算法誤判**。

程式根因候選：`frontend/src/services/nameRomanization.ts` 以 `pinyin-pro` 加上一部分台灣常見譯音別名，逐字對照 MRZ token。如果字數／音節數不符會直接 `conflict`；字數相同但只有少數音節不符，也可能 `conflict`。在 `frontend/src/services/paddleOcr.ts`，中文姓名候選若為 `conflict` 會被排除。沒有足夠資料確認這七張分別是哪一類。

**下一次最小實驗：** 僅在 Validation trace 計數造成 conflict 的分類（token count mismatch、1 syllable mismatch、其他），不要把中文姓名、MRZ token、證件號碼、每張 OCR 文本記錄在報告或 GitHub。新的判斷規則只能 shadow 比較，不改正式結果；即使修正候選命中，仍要確認對既有正確樣本的誤選風險。固定 Test `2026.10.09.1` 不拿來調參。

## 2026-10-11：讀取 romanization 衝突子分類（未驗證假說）

僅對 shadow trace 中原本 `romanization-conflict` 的候選，額外比對中文字數與 MRZ token 數、逐字拼音別名匹配結果，分為 token-count-mismatch、one-syllable-mismatch、other-mismatch、unclassified。診斷沿用正式 comparator 的判定，但**不會改寫相容性回傳、候選排名、閾值或 OCR 輸出**。畫面只保留聚合張數，不保存人名／護照資料。需要本機 Validation 重新量測才可判斷 7 張的實際分布；CI 綠燈不等於具體原因已證實。

## 2026-10-11：單音節拼音衝突 7/7 的本機實測

使用者於正式 auto/WebGPU 模式重跑 32 張 Validation（護照 19、台胞證 13），32 張完成、0 失敗。護照中文姓名錯誤 12 張中，7 張有 OCR 完整正確姓名候選；這 7 張的 shadow trace 全部顯示 `romanization:one-syllable-mismatch`，無 token-count-mismatch 或其他子類。其餘 5 張候選內容不符。

已知程式行為：`compareChineseNameToMrzRomanization()` 在中文字與 MRZ token 數相同、恰一音節不相容時回傳 `conflict`；selector 拒絕 conflict。這是證據指向的一個**具體 gate**，但不保證放寬它能救回全部 7 張，因為影像樣本不一定代表七個獨立人名，亦可能有其他 eligibility／排名條件。

**下一個安全驗證關卡：** 不輸出姓名與 token，只做 Validation-only shadow comparison：觀察若允許一音節衝突（但保留幾何位置、score 與其他條件），能修正多少張原本錯誤樣本，又會使多少張原本正確樣本退步。必要時候再研究具體台灣常見譯音別名，但不得基於 Test baseline 反覆調參。此次樣本的 exact OCR 工作輸入圖仍為 0/32，只能作 legacy regression。

## 2026-10-11 — 單音節衝突 shadow 反事實實驗

- 狀態：研究分支；**正式 OCR 候選輸出不改**；需 CI 及本機 Validation 實測。
- 既有 selector 原樣運作；只在診斷 observer 計算允許一音節衝突的候選，且把衝突視作未獲拼音核准，保留較嚴格的 unknown confidence/rank gate，不加 compatible 權重。
- Validation 只留匿名彙總：潛在改善、潛在退步、維持正確、維持錯誤。這是已走到的 crop/方向的近似反事實觀察，不是完整第二套 OCR 流程，也不能當作正式改版門檻。
- 本資料集 32/32 缺少當年確切 OCR 工作圖；須按 Traveler 檢查重複樣本，固定 Test baseline `2026.10.09.1` 不動。

## 2026-10-11 — 加速策略：一次比較正式／外交部拼音／單音節放寬

- 目標：停止每新增一個小分類就要求使用者重跑 32 張；同一次 Validation 計算多個 shadow 候選模式的聚合改善／退步，並自動在 CI 執行合成正負案例測試。
- 官方依據：領事事務局《護照外文姓名拼音對照表》 https://www.boca.gov.tw/cp-2-4226-c0eff-1.html，涵蓋 WG、國語注音第二式、通用及漢語拼音；官方亦說明不強制限於這些拼音 https://www.boca.gov.tw/cp-35-7873-3a928-1.html。
- 新增 `frontend/src/services/officialRomanizationVariants.ts`：來源核對的**部分**官方音節異寫表，非完整表，也不涵蓋各族語／個人選用拼法。新增 `compareChineseNameToMrzWithOfficialVariants` 僅供 shadow；原 `compareChineseNameToMrzRomanization` 保持原核准規則。
- 與 PR #16 的「單音節衝突放寬 shadow」一起計算。兩者均保留原本 candidate geometry、confidence 與 rank 限制；官方音節完全吻合才視為 compatible，未吻合仍不放行。
- `frontend/scripts/test-romanization.mjs` 使用實際 TS 程式在 CI 測合成正反案例，防止改壞正式拼音判斷；測試只涵蓋示例拼法，不代表真實證件辨識率。
- Validation UI 只顯示兩種策略各自的潛在改善、退步與維持不變張數，不儲存人名或原始 OCR。仍是同一次現有 crop 的近似反事實，非完整重新跑另一套 OCR、不是正式導入決策。
- 既有 32 張皆缺乏當次確切 OCR 工作圖，且可能有重複 Traveler；最終應以不同 Traveler、不同證件類別與後續保存完整輸入的 Validation 作審慎評估。
- 本輪 PR/CI：待本分支驗證後補充；正式 OCR pipeline `2026.10.09.1` 與 fixed Test 沒有改動。

## 2026-10-11 — 受限官方拼音候選導入（待真人 Validation 驗證）

- 實測來源：32 張舊 Validation 的正式姓名正確 7/19；官方拼音 shadow 潛在改善 6、退步 0（模擬結果 13/19），單音節放寬潛在改善 7、退步 0（模擬 14/19）。**兩者都不是已實現的正式 OCR 精準率**，因先前的 shadow 只參考已執行 crop，且全部缺少保存當次 OCR 工作圖。
- 為加快實際修復，新增 `officialNameSuggestion.ts` 的嚴格回填：只有現有選擇器原本要留空、OCR 候選已有原本姓名位置或明確姓名標籤資格、有效 MRZ、候選與官方拼音異寫完整相符、OCR score >= 0.78 且只有一種**不同候選字串**符合條件時，才填入待人工審核的中文姓名。不會覆寫既有成功候選；若候選競爭或證據不足則保持留空。
- 這是產生**人工覆核建議**，不改動人工已審核旅客、DocumentVersion、歷史團別紀錄或後端驗證；每位旅客仍需要審核。**不以一個音節任意不符作為核准**。
- 正式 pipeline 字串更新為 `2026.10.11.1`，原固定 Test baseline `2026.10.09.1` 仍保留且禁止反覆調參；CI 的合成案例只驗證決策條件，不能代表照片辨識率。
- 下一步：在新版本下跑一次同批 Validation，觀察中文姓名實際輸出（不只影子候選）；比對是否如預期提升且不降低其他欄位。需逐 Traveler 與包含完整 OCR 工作輸入的新 Validation 共同查核後，才宣稱泛化改善。

## 2026-10-11：正式護照 68% 及台胞證保守改善批次

在同一批 32 張舊 Validation（護照 19、台胞證 13），正式版 `2026.10.11.1` WebGPU 第一次回歸：護照中文姓名及整張全對 **13/19（68%）**，舊 `2026.10.09.1` 為 7/19（37%）；改善 6 張，其他必要欄位維持 100%。這是使用者截圖提供的真實 pipeline 結果，不是 shadow 估算。剩餘 6 張護照中文姓名錯誤（1 張已有正確候選、5 張候選文字不符）。台胞證仍是 5/13 整張正確、6/13 中文姓名、10/13 性別。32/32 缺原始工作輸入圖，僅可作既有審核圖回歸；不外推至新上傳。

新批次先處理台胞證**有標籤但因無關英文文字失敗**、**MRZ 未驗證時的性別證據優先序**，並對損壞的 MRZ 中文解碼做漢字格式檢查。保留所有近距離英文姓名的真正拼音衝突拒絕，保留有效 MRZ、審核機制、固定 Test baseline。以合成正／反案例 CI 防止無條件放行。所有改善幅度需要本機回歸才能定量。

## 2026-10-11：台胞證 2026.10.11.2 正式回歸無增益與下一批試驗

已實測 32/32 完成：護照依然 13/19（68%），台胞證全對 5/13（38%）、中文姓名 6/13（46%）、性別 10/13（77%）。前一批 PR #19 沒有改善這批 Legacy Validation。此結果反駁了「僅修改姓名標籤 fallback 或性別 MRZ evidence precedence 即足以改善」的假設，不代表修改完全無用於新樣本。

發現新設計瓶頸：`retryPermitChineseName` 僅在 OCR 姓名**空白**時執行；非空白但錯誤的低信心姓名未得到裁切重辨識機會。新候選版本 `2026.10.11.3` 在 9 秒軟預算內重新辨識不可靠姓名；只在原 confidence <0.88 且兩種裁切共識／高信心時才允許修改未審核建議。此機制可能增加延遲，亦未保證修好 7 張錯誤樣本。

同一輪 Validation 同時輸出匿名「exact 中文姓名錯誤但簡繁字形可能相當」數量：使用現有 script conversion helper 做一對多比較，**不得當成已驗證姓名匹配或新增的準確率**。若這個數量很高，應先研究不歧義的字形正規化與姓氏異體字；若接近 0，應優先改良文字偵測與裁切，而不是盲目調換簡繁轉換函式。仍缺 32/32 當次原始 OCR 工作圖，不能推論端到端新照片準確率。

## 2026-10-11：台胞證連續兩版零增益，MRZ sex / Chinese name 的信任缺口

本機實測 OCR 2026.10.11.3：護照 13/19 全對、台胞證 5/13 全對，台胞證中文姓名 6/13、性別 10/13，簡繁字形近似但 exact 錯誤 **0 張**。這否定了「增加低信心姓名重試或更動簡繁轉換即可改善這批樣本」的預期。本批還是缺 exact OCR 工作影像。

真正的程式缺口：`taiwanPermitMrz.ts` 的 composite check 值包含 line1 指定證號與日期區、line2.slice(19, 29)，**未涵蓋 line1[22] 性別字元、line2.slice(0,16) GBK 中文姓名**。所以 requiredValid 表示某些 MRZ 欄位通過檢查，不能替姓名／性別提供強驗證。過去仍以 requiredValid 直接保護 sex，並給 GBK 姓名高至 0.99 confidence。

候選 `2026.10.11.4`：對性別與姓名做**正面 OCR 證據交叉比對**，只有高信心且各解析路徑相符才允許覆蓋 MRZ；來源不足時不激進猜測。另降低尚無正面佐證之 GBK 姓名的信心，交由既有帶共識限制的局部重辨識檢查。合成測試保護正反案例；真實 cohort 成效未知，並非宣稱已修復。

## 2026-10-11：台胞證重辨識的裁切位置優先序

`createPermitNameGroupCrop()` 原本先用辨識信心最高的 Latin text，才退而選「姓名」標籤。OCR 可能將其他兩個以上英文詞組誤認為人名，造成局部裁切移到非姓名區。新候選 `2026.10.11.5` 直接優先高分的姓名標籤，沒有標籤才使用英文錨點；維持同一張原始圖與原本 crop 尺寸。需跟 PR #21 的姓名／性別修正一起做一次 Validation，檢查準確率與延遲。沒有個別錯誤原圖，不能預先斷言有增益。

## 2026-10-11 05:22：移交紀錄 — 主線 `.5` 尚未實測，避免誤判為已改善

**最後照片回歸證據**是 OCR `2026.10.11.3` 正式 auto/WebGPU：護照 13/19 整張全對（68%）；台胞證 5/13 整張全對（38%），中文姓名 6/13（46%），性別 10/13（77%）；簡繁字形可能等價但 exact 不同 0 張；32/32 成功。相比 `.2` 沒有提升，不能聲稱低信心姓名重試修好了已知七張台胞證錯誤。

**已合併但缺本機驗收**：PR #21（MRZ checksum 未涵蓋姓名和性別時的正面欄位交叉核對）、PR #22（姓名 crop 優先實際姓名標籤）。目前 GitHub main 宣告 `2026.10.11.5`；main CI #801、#803 Success。不要把這些程式改動或 CI 綠燈當成精準率提升。固定 Test baseline `2026.10.09.1` 與 pipeline 版本不同，不允許拿 Test 做調參。

**下一個批次**先只做一次 `.5` 正式 auto Validation，比對護照 68%、台胞證 38%／46%／77%、欄位 100% 與延遲。如仍無改善，優先取得合法保存的實際 OCR 工作圖（含 ROI），以匿名／受控方式分析偵測、裁切與文字辨識來源；不要再僅靠候選 selector 門檻做重複猜測。所有 32 張 legacy 樣本都缺真正工作輸入圖，並可能含同一 Traveler 的多張照片。

## 2026-10-11 15:03：2026.10.11.5 正式 Legacy Validation 無增益（實測）

使用者在版本 `2026.10.11.5` 完成一次正式 auto 模式 32 張本機 Validation；det / rec provider 均為 WebGPU。護照 n=19，整張全對及中文姓名 13/19 (68%)；台胞證 n=13，整張全對 5/13 (38%)、中文姓名 6/13 (46%)、性別 10/13 (77%)，其餘已評估必要欄位 100%。全部 32 張完成、0 失敗；台胞證可能僅簡繁字形等價但 exact 不同者 0 張。護照 OCR median 2.1 秒 / P90 4.5 秒，台胞證 3.4 秒 / P90 6.8 秒。

**對照 `.3` 的欄位正確數一致，`.4` MRZ 姓名／性別交叉證據及 `.5` 姓名標籤優先重裁切未在此 cohort 帶來淨改善。** 不能解讀為單張沒有正負變化；也不能以合成測試成功推論真實 OCR 準確率。32 張皆缺當次真實 OCR 工作影像、可能存在同 Traveler 多張，身分證 n=0。這是保留審核影像的 legacy regression，不是新上傳端到端數據。

後續不再推進相同的門檻微調，改先取得合法可用且**保留真正 OCR 工作輸入**的 Train/Validation（同 Traveler 不跨 split），分離出 orientation、detection、recognition、crop/ROI、MRZ/parse 的失敗來源；本機離線分析，絕不將個資、OCR raw text、證件圖推至 GitHub。重點在台胞證姓名及性別錯誤歸因與成批改善；fixed Test 凍結。詳見 Issue #25。

## 2026-10-11 — 台胞證 OCR candidate / review-image provenance 檢查（候選 .6，未實測）

檢查 `recognizeTaiwanCompatriotPermitWithPaddle` 發現：微傾角 deskew 可以執行第二次 OCR，當品質未達原 `best` 時應保留舊 OCR prediction；但此前 `reviewImage`、`reviewRotation` 已更新為新圖，即使新 OCR 被拒絕也會提供不同影像供覆核／擷取，而欄位仍來自舊圖。修正為**品質 gate 選出 `best` 後才設定 review image / rotation**，避免將被拒絕的影像標作被選中之 OCR 的工作來源。

這是來源一致性修復，不包含影像對照實測；不代表改善台胞證姓名 6/13 或性別 10/13。結構性 CI guard 只保護程式路徑，不能保證端到端辨識率。後續需蒐集合法且可分組的真正 OCR 工作輸入，方可評估 ROI 與 recognition 失敗根因。

## 2026-10-11 — 台胞證匿名 OCR 原始文字列分類（候選，未實測）

在 Validation 內針對台胞證姓名錯誤，比對選中 OCR 的 rawRows 後只保存三種分類計數：`exact-raw-row`、`embedded-in-raw-row`、`not-in-selected-raw-rows`。僅瞬間在本機記憶體處理姓名，報告不含真值、OCR 文字、ID、逐張結果與影像。合成測試檢查分類及匿名輸出並接入 CI。這只能指出最終 OCR 文字列是否包含姓名，**不能確定 Detection/Recognition/ROI 的根因**，也無法補回缺失的 OCR 工作輸入圖。尚無本機 Validation 或精準率提升證據。保留固定 Test、人工覆核與影像政策；下一步做真實工作圖來源／ROI 分析並整批驗收。

## 2026-10-11 — 候選 .8：台胞證姓名二次裁切標籤信任順序（未實測）

程式檢查發現：目前 `createPermitNameGroupCrop()` 同時將「姓名」及 `Name` 放在同一組 label anchors，以 confidence 排序，會讓較高分的英文 Name 標籤擠掉真實中文字樣。候選版 `.8` 只改 **name retry ROI anchor**：先找中文「姓名」，缺失才用英文 Name，仍找不到才以拉丁姓名為錨點。保留 .7 的 `predictionImage` 同座標來源、既有姓名共識檢查與人工審核；不改固定 Test、照片保留或旅客正式資料。加入 `npm.cmd run test:permit-name-roi` 的結構性來源防退步測試，但 GitHub Actions 額度保護仍有效且不會觸發。**這是推定具風險的選錨行為修正，沒有真實影像驗證，不能宣稱準確率提升或新版本成功。** 待本機 test + build 後才合併，之後與其他有效批次一次 Validation。仍優先取得真正工作影像與 Detection/Recognition 的可用證據。

## 2026-10-11 — 台胞證 OCR 匿名來源統計（待本機驗證）

延續 `.8` 主線，只增加 Validation 的可觀察性，不更改 OCR 判斷／模型／輸出或版本號。利用現有 `distanceCropUsed`、`chineseNamePasses`、`chineseNameConsensus`、`mrzUsed`，在每張 Evaluation 的記憶體內做匿名彙總，僅報告「選用放大距離裁切」「姓名重讀候選已採用」「雙區域一致候選」「MRZ 提供過欄位」四項件數。程式抽出 `permitSourceEvidence.ts`，新增 synthetic `test:permit-source` 驗證計數與無個資輸出。與既有「7 張姓名錯誤未在選中 rawRows 中出現」分類搭配，僅可縮小研究範圍；**不能確定 Detection/Recognition 因果，也沒有修正 OCR 精準率**。沒有個人名字、原始 OCR 文字、sample ID、工作影像或逐張資料保存到結果或 GitHub。

GitHub Actions 因額度限制維持 `workflow_dispatch` 且不得執行。此批在 GitHub Connector 完成原始碼和文檔更新，尚無本機 Build／照片 Validation 證據；等本批整理完成再讓使用者一次執行。正式 `.8` 與最後實際 `.6` 精準度請區分；fixed Test 不變。

## 2026-10-11 — main 直接開發：台胞證姓名重讀影像清晰度（OCR 2026.10.11.9；待驗證）

依單人 main-first 決策，不再為每個小改動開 PR。將 `retryPermitChineseName` 中原使用 `createRelativeCrop(image, .08, .06, .84, .72)` 的廣域姓名二次 OCR，改為相同來源範圍、`createPixelCrop(..., 1500)`：較小影像不再因通用裁切縮至原寬，而能有限度提升漢字 OCR 輸入寬度；沿用共用裁切 1800px 上限。原照片及主要 OCR 管線均未改；無網路 OCR、無影像持久化。新增 `npm.cmd run test:permit-broad-crop` 原始碼守衛；需要搭配本機 Build 與後續 Validation 實測，**尚不能宣稱準確率提升**，也不保證放大一定有效，可能使運算時間增加。

這個 main 修改目前未含 PR #33 的診斷功能，PR #33 仍在獨立舊分支上且尚未本機測試；不能直接假設 PR 已併入或在未檢查衝突前合併。後續應先驗證 main .9，統一收束 PR #33，避免重複小 PR。GitHub Actions 僅 workflow_dispatch，禁用雲端執行。最後實際照片準確率仍 .6，凍結 fixed Test 不變。


## 2026-10-11 — OCR 2026.10.11.10 main 批次候選（已完成程式，待一次本機＋照片驗證）

本批依單人 main-first 流程直接累積於 `main`，不再拆小 PR；舊 PR #33 的匿名診斷能力已安全搬回 main，PR #33 已關閉且未合併，避免舊分支覆蓋新版。

### 本批真正影響 OCR 的變更

- 台胞證姓名 broad retry 不再用會縮小低解析來源的通用 crop，改用有限放大的 `createPixelCrop`。
- ROI 起點 clamp 到影像合法邊界；放大最多 2.5x、輸出寬度最多 1800px，避免極端插值與 Canvas 資源暴增。
- 對姓名 retry 只增加 **一個**灰階＋1.25 對比增強變體；優先 tight/anchored ROI，沒有 anchor 才增強 broad ROI。
- retry 每次 OCR 前檢查既有 9 秒 soft budget；超時即停止，不強制跑完所有變體。
- `currentConfidence === null` 現在視為不確定，而不是可靠：允許啟動 retry，也允許高品質 retry 結果取代未知 confidence 的既有姓名。
- 增強圖與原圖若來自同一 ROI，不再算兩個獨立 consensus；覆蓋既有姓名仍要求 anchored / broad 兩個獨立區域一致。
- pipeline metadata 已正確更新為 `2026.10.11.10`（先前文件提到 .9/.10，但程式常數仍停在 .8 的問題已修正）。

### 診斷與測試

- PR #33 的匿名 retry 診斷已直接整合 main：Validation 可看到全部台胞證及「中文姓名錯誤子群」的 retry 次數、OCR box 次數、姓名候選次數。
- 新增/更新純函式測試：pixel enhancement、retry evidence independent-region consensus、null-confidence policy、retry diagnostics、ROI scale/bounds。
- `npm.cmd run test:ocr-regression` 可一次執行全部 OCR regression scripts；另需 `npm.cmd run build`。
- 已用 GitHub 端靜態檢查確認 `.10` 版本、bounded upscale、ROI clamp、enhancement、time budget、independent consensus、Validation wrong-name wiring 均存在；**GitHub Connector 不能代替本機 Node/Vite 執行**。
- GitHub Actions 仍僅 `workflow_dispatch`，本批沒有啟動 Actions。

### 驗證標準

最後有照片實測證據的仍是 `.6`：護照全欄 13/19、台胞證全欄 5/13；台胞證中文姓名 6/13。`.10` 尚未照片驗證，絕不可先宣稱提升。下一次應只做一次集中驗證：本機 regression + build 通過後，再跑既有 32 張 auto Validation，比較 `.10` 對 `.6` 的淨改善、退步及耗時。固定 Test 不變，不把 Test 圖加入 Train。


## 2026-10-11 — `.10` 實測退步，main 已轉為 `.11` raw-row selector 修正候選

使用者完成正確 Docker frontend 重建後，正式 auto Validation 明確顯示版本 `2026.10.11.10`，32/32 成功。護照維持：全欄 68%（13/19）、中文姓名 68%、其餘評估欄位 100%。台胞證退步為：全欄 31%（4/13）、中文姓名 38%（5/13）、性別 77%（10/13）、出生日期／證件號碼／有效期限 100%。因此 `.10` 不可視為改善，與 `.6` 比較台胞證中文姓名由 6/13 降至 5/13、全欄由 5/13 降至 4/13。

真正關鍵證據：`.10` 的 8 張台胞證中文姓名錯誤樣本中，ground truth 姓名 **8/8 都完整存在於選中 OCR raw row**；embedded 0、raw row 缺失 0。錯誤子群啟動姓名重讀 8 張，共 24 次裁切 OCR，24/24 有文字框，但只有 1 次形成目前規則下的合格姓名候選。這表示此批主要瓶頸已從 Detection/Recognition 縮小到 **raw row 後處理／候選選擇**。

另發現 `.10` 診斷文字「姓名重讀候選已採用 6」是統計語意 bug：原程式用 `chineseNamePasses > 0` 代表 retry accepted，但初次 OCR 有姓名也會 passes=1。`.11` 新增明確 `nameRetryApplied`，只在 retry 真正覆寫最終姓名時為 true；Validation 改顯示「姓名重讀實際覆寫」。

### `.11` main 候選變更

- `extractPermitChineseNameFromRows` 不再只找「Latin name 前 1–2 列並取第一個非 conflict」；現在掃描全部 raw rows，把所有 plausible Han candidate 與所有 Latin name rows、姓名 label row 建立匿名 evidence，再由 `permitRawNameEvidence.ts` 排序。
- romanization `compatible` 的 raw-row candidate 即使因 row grouping 距離較遠也優先；`unknown` candidate 必須靠近姓名 label 或 Latin row；`conflict` 一律排除。
- `.10` 的灰階／對比 enhancement retry 已退出正式流程並刪除相關模組與測試：實測沒有帶來姓名收益，卻增加 8 張錯誤樣本到 24 次 retry OCR。
- 恢復保守 retry policy：已有姓名但沒有可量化 confidence 時不做無效 retry，也不能被 retry 覆寫；只有缺姓名或低數值 confidence 才重讀。
- pipeline metadata 更新為 `2026.10.11.11`。
- 新增 `test:permit-raw-name`，並納入單一 `npm.cmd run verify:ocr` regression/build 入口；測試包含 compatible far-row 優先、conflict 排除、unknown 無錨點拒絕、近 label unknown 允許，以及實際 OCR wiring 不再使用舊 `offset <= 2` first-match 邏輯。

`.11` 尚未本機程式驗證與照片 Validation，不能宣稱提升。下一個驗證點是一次 `verify:ocr` + Docker frontend rebuild + 固定 32 張正式 auto Validation。GitHub Actions 維持禁用。


## 2026-10-11 — `.11` 實測無準確率改善；main 已進入 `.12` Latin-name anchor 修正

使用者在 Docker frontend 顯示 `目前頁面 OCR pipeline: 2026.10.11.11` 後完成正式 auto Validation。32/32 成功；護照維持全欄 68%（13/19）、中文姓名 68%、其餘欄位 100%。台胞證仍為全欄 31%（4/13）、中文姓名 38%（5/13）、性別 77%、出生日期／證件號碼／有效期限 100%。因此 `.11` 的 all-raw-row selector 在現有樣本上沒有帶來正確率提升。

`.11` 診斷進一步確認：8 張錯誤姓名仍有 8/8 完整 ground-truth 姓名存在 raw row；retry 由 `.10` 的 24 次降至 16 次，16/16 有文字框、只有 1 次有合格候選，且「姓名重讀實際覆寫」為 0。故 `.10`/`.11` 的姓名錯誤不是 retry 覆寫造成；問題仍是 raw-row candidate 沒有取得足夠 anchor evidence。

### `.12` 直接根因修正

程式檢查發現 `extractPermitLatinName()` 把 `NAME` 列為 stop word。台胞證 OCR 若把印刷標籤與英文姓名合併成 `Name LIN YI CHEN`，舊 parser 會整列拒絕，導致 `.11` 的 raw-row selector 沒有 Romanization anchor；即使正確中文姓名已在 raw row，仍可能只得到 `unknown` 並因離姓名 label 太遠而被排除。

`.12` 將英文姓名 parser 抽成 `permitLatinName.ts`：只移除**開頭**的 `Name` 標籤，再套原有 stop-word 與格式檢查；`NAME` 出現在其他位置仍會拒絕。新增功能測試涵蓋 `Name LIN YI CHEN`、`NAME CHEN, YI-CHEN`、無標籤姓名與 SEX/TAIWAN/單 token 負例。

同批加入匿名 raw-row selector 診斷：Latin row 件數、姓名 label row 件數、是否存在 romanization-compatible candidate、最後選到 compatible/unknown/none 的件數。只保存彙總，不保存姓名、raw row、sample ID 或圖片。新增 `test:permit-raw-name-diagnostics` 並納入 `verify:ocr`。

pipeline metadata 已更新為 `2026.10.11.12`。`.12` 尚未本機 regression/build 與照片 Validation，不能宣稱提升。下一個唯一驗證點：`npm.cmd run verify:ocr` → rebuild frontend container → 確認頁面 `.12` → 同一組 32 張 auto Validation。GitHub Actions 仍禁止執行。


## 2026-10-11 — `.12` 實測仍無改善；main 已進入 `.13` conservative conflict fallback

使用者完成 `.12` 正式 auto Validation：32/32 成功。護照維持全欄 68%（13/19）、中文姓名 68%；台胞證仍全欄 31%（4/13）、中文姓名 38%（5/13）、性別 77%、出生日期／證件號碼／有效期限 100%。因此 `.12` 的 `Name ...` Latin-row parser 修正本身沒有提高正確率。

`.12` 新增 selector 診斷顯示：13/13 台胞證都有英文姓名列；0/13 有獨立姓名標籤列；5/13 有 romanization-compatible 中文候選，最終也正好選到 compatible 5 張；selected unknown 0 張；8 張完全沒選到 raw-row 姓名。另一方面，既有 ground-truth 對照仍顯示這 8 張錯誤樣本的正確中文姓名 **8/8 已完整存在 raw row**。因此剩餘阻塞高度集中在 Romanization `conflict`／anchor gating，而不是 Detection、Recognition 或 Latin row 解析。

### `.13` main 候選

- `permitRawNameEvidence.ts` 新增保守 conflict fallback：只有在沒有任何 compatible / 可接受 unknown 候選時，才允許 `compatibility=conflict` 的 raw-row candidate。
- fallback 必須同時滿足：standalone/exact raw row、純姓名值 2–4 字、距離已解析 Latin name row 最多 2 個 OCR row。目的是救 legacy／非標準拼音或英文 OCR 輕微偏差，不放寬到發證機關、地址、長中文文字。
- compatible / anchored unknown 永遠優先於 conflict fallback；已新增 synthetic regression tests 鎖定此排序。
- pipeline metadata 更新為 `2026.10.11.13`。
- Validation 匿名診斷增加：有 conflict candidate 的樣本數、符合 fallback 條件的樣本數、實際選到 conflict fallback 的樣本數；不保存姓名、raw row、sample ID 或影像。

`.13` 尚未本機 `verify:ocr`／Docker rebuild／照片 Validation，不能宣稱提升。下一個驗證點只需一次完整流程；GitHub Actions 維持關閉。


## 2026-10-11 — `.13` 實測仍無改善；main 已進入 `.14` four-row conservative conflict fallback

使用者完成 `.13` 正式 auto Validation：32/32 成功。護照維持全欄 68%（13/19）、中文姓名 68%；台胞證仍全欄 31%（4/13）、中文姓名 38%（5/13）、性別 77%、出生日期／證件號碼／有效期限 100%。因此 `.13` 的 conflict fallback 在原本 `latinDistance <= 2` 條件下沒有改善。

`.13` selector 診斷：13/13 台胞證都有英文姓名列；0/13 有姓名標籤列；5/13 有 romanization-compatible 中文候選；9/13 有 romanization-conflict 中文候選；但 **0/13 符合原本保守 fallback 條件**，最終 compatible 5、unknown 0、conflict fallback 0、raw-row none 8。既有 ground-truth 對照仍顯示 8 張姓名錯誤中 8/8 正確姓名完整存在 raw row。這強烈指向 `latinDistance <= 2` 對 OCR row grouping 過嚴。

### `.14` main 候選

- 保留原本安全框架，只將 conflict fallback 的 Latin row 距離由 `<=2` 放寬到 `<=4`。其他條件不變：candidate 必須為 standalone/exact raw row、2–4 個中文字，且只有在 compatible / 合理 unknown 候選都不可用時才考慮。
- 再加一層保護：**只有恰好一個** eligible conflict fallback candidate 才自動選用；如果同一張有多個 eligible short Han row，直接放棄 fallback，交人工審核，不猜。
- 新增匿名距離診斷：有 short/exact conflict candidate 的樣本數、最近 Latin row 距離 `<=2` / `3–4` / `>=5`、eligible fallback 樣本數、unique eligible 與 ambiguous eligible 件數、最終實際選到 fallback 件數。
- synthetic tests 已補：4 rows 可接受、5 rows 拒絕、長中文拒絕、非 exact row 拒絕、compatible/unknown 永遠優先、多個 eligible conflict 候選必須拒絕。
- pipeline metadata 更新為 `2026.10.11.14`。

`.14` 尚未在使用者 Windows 本機執行 `verify:ocr`／Docker rebuild／32 張照片 Validation，不能宣稱提升。GitHub Actions 維持 workflow_dispatch only，未執行。


## 2026-10-11 — `.14` 實測證明 row-distance fallback 無效；main 已進入 `.15` BOCA 官方拼音升級

使用者完成 `.14` 正式 auto Validation：32/32 成功。護照維持全欄 68%（13/19）、中文姓名 68%；台胞證仍全欄 31%（4/13）、中文姓名 38%（5/13）、性別 77%、出生日期／證件號碼／有效期限 100%。因此 `.14` 沒有準確率提升。

`.14` raw-row selector 診斷：13/13 有英文姓名列；0/13 有姓名標籤列；5/13 有標準 romanization-compatible 中文候選；9/13 有 conflict 中文候選；其中 8/13 是 2–4 字完整獨立列。**最近英文姓名 row 距離分布為 <=2: 0、3–4: 0、>=5: 8**。所以 `.13/.14` 的 row-index distance 並不是可靠姓名 anchor；把距離門檻從 2 放寬到 4 仍 0 張 eligible，且不得再繼續無限制放寬。

同時既有 ground-truth 對照仍顯示 8 張台胞證中文姓名錯誤樣本中，8/8 正確姓名完整存在 raw row。問題因此集中在 Romanization gating，而不是 Detection、Recognition、Latin row 解析或 retry。

### `.15` main 候選

- 停止 row-distance conflict fallback 對正式 selector 的影響；`permitRawNameEvidence.ts` 現在只接受 compatible 或有合理 anchor 的 unknown。距離 bucket 僅保留匿名診斷用途。
- raw-row Romanization 判斷改由 `permitRawNameRomanization.ts` 純函式統一處理。標準拼音 compatible 永遠優先；若標準 comparator 為 conflict，但 `compareChineseNameToMrzWithOfficialVariants()` 根據既有 BOCA WG / MPS-II / Tongyong / Hanyu 對照表可完整匹配，才升級為 compatible。
- 官方拼音升級不放寬 one-syllable mismatch，也不接受任意 fuzzy spelling；真正錯誤仍保持 conflict。
- Validation 新增匿名 BOCA 指標：有 official-variant promotion candidate 的樣本數、最終實際選到官方拼音升級候選的樣本數。
- 同一輪新增匿名 conflict subtype：token-count-mismatch、one-syllable-mismatch、other-mismatch、unclassified。若 `.15` 沒提升，下一步可直接依 subtype 處理，不需另跑一輪只為診斷。
- 新增 `test:permit-raw-romanization` 功能測試，直接執行 resolver，驗證標準 compatible、BOCA-only compatible、標準優先、真正 conflict、token-count conflict、unknown 與無 anchor。既有 selector/diagnostics tests 已移除 `.14` fallback 預期並改鎖 `.15` 行為。
- pipeline metadata 更新為 `2026.10.11.15`。

`.15` 尚未在使用者 Windows 本機執行 `npm.cmd run verify:ocr`、Docker frontend rebuild 或 32 張照片 Validation，不能宣稱提升。GitHub Actions 維持 workflow_dispatch only，未執行。


## 2026-10-12 — `.15` 首次取得明確實質提升；BOCA 官方拼音路徑有效

使用者完成 `2026.10.11.15` 正式 auto Validation，32/32 成功。護照維持：全欄 68%（13/19）、中文姓名 68%、其餘評估欄位 100%。台胞證明顯提升：全欄 **54%（7/13）**，中文姓名 **69%（9/13）**，出生日期 100%、性別 77%、證件號碼 100%、有效期限 100%。相較 `.14` / `.6`：台胞證全欄由 4/13 / 5/13 提升到 7/13；中文姓名由 5/13 / 6/13 提升到 9/13。

`.15` raw-row selector 診斷顯示 BOCA 官方／舊式拼音 promotion 是有效來源：有 official-variant promotion candidate 4 張，最終實際選到 official-variant candidate 4 張；最終 compatible 共 9 張，unknown 0 張，raw-row none 4 張。這與中文姓名 9/13 正確率一致，說明此次增益直接來自 Romanization gating 修正，而不是影像 retry 或 row-distance fallback。

剩餘 conflict subtype 匿名樣本數：token-count mismatch 6、one-syllable mismatch 2、other 0、unclassified 0。這些是樣本是否出現該類 conflict candidate 的匿名計數，可重疊，不等於 8 張唯一錯誤樣本。下一步應針對剩餘 4 張姓名錯誤，先處理 **token-count mismatch** 與 **one-syllable mismatch** 的可安全自動判斷，不再回到 row-index distance fallback。

`.15` 已證明：標準 romanization + BOCA 官方拼音別名 + all-raw-row selector 是目前有效方向。任何後續修改都必須維持護照 13/19、不降低台胞證現有 9/13 中文姓名，並保留固定 Validation 比較。


## 2026-10-12 — `.15` 首次大幅提升；main 已進入 `.16` exact joined-token Romanization

`.15` 正式 auto Validation 已確認有效：32/32 成功；護照全欄維持 68%（13/19）、中文姓名 68%。台胞證全欄提升到 **54%（7/13）**，中文姓名提升到 **69%（9/13）**；出生日期 100%、性別 77%、證件號碼 100%、有效期限 100%。這是自 `.6` 之後第一個明確超越舊基準的台胞證姓名版本。

`.15` 匿名 selector 證據：BOCA 官方／舊式拼音 promotion candidate 4 張，最終實際選中 4 張；最終 compatible 共 9 張，raw-row none 4 張。剩餘 conflict subtype 樣本數為 token-count mismatch 6、one-syllable mismatch 2、other 0、unclassified 0。這些 subtype 樣本數可重疊，不等同 8 張唯一錯誤樣本。

### `.16` main 候選

- 不改 BOCA `.15` 成功邏輯，也不恢復 row-distance fallback。
- 針對最大的剩餘 subtype `token-count-mismatch`：新增 `matchesChineseNameToJoinedRomanizationWithOfficialVariants()`。只有當標準與 BOCA 一般 token-by-token 比對仍 conflict，且 conflict subtype 是 token-count mismatch 時才啟用。
- joined-token 判斷會把 surname + given-name tokens 正規化後完整串接，再以每個中文字所有合法 Hanyu/common/BOCA 拼音 aliases 做精確動態切分；**每個中文字必須消耗一個合法 alias，整個 Latin 字串必須剛好全部消耗**。不允許任意 fuzzy edit，也不處理 one-syllable mismatch。
- 範例：`王一明 / WANG IMING` 可由 `WANG + I + MING` 精確切分；`王英明 / WANG YINMING` 仍不可因只差一個音節而通過。
- resolver 優先序：標準 compatible > BOCA official compatible > exact joined-token compatible > anchored unknown > conflict。標準 compatible 即使距離較遠仍優先於 promotion。
- Validation 新增匿名 joined-token 指標：有 exact joined-token promotion candidate 的樣本數、最終實際選中 joined-token candidate 的樣本數。既有 conflict subtype 同輪保留，因此 `.16` 若仍未救完剩餘 4 張，不需再跑純診斷版本。
- 新增/擴充 executable tests：`test-romanization.mjs` 直接測 joined-token 正負例；`test-permit-raw-name-romanization.mjs` 測 resolver promotion、標準優先及負例；diagnostics test 驗證 joined-token 匿名 aggregate 與 UI wiring。所有測試仍由 `npm.cmd run verify:ocr` 一次執行。
- pipeline metadata 更新為 `2026.10.11.16`。

`.16` 尚未在使用者 Windows 本機執行 verify/build 或照片 Validation，不能宣稱進一步提升。GitHub Actions 仍 workflow_dispatch only、未執行。


## 2026-10-12 — `.16` 再次實質提升；main 下一步聚焦唯一 one-syllable mismatch

使用者完成 `2026.10.11.16` 正式 auto Validation，32/32 成功。護照維持：全欄 68%（13/19）、中文姓名 68%、其餘評估欄位 100%。台胞證再提升：全欄 **69%（9/13）**，中文姓名 **85%（11/13）**；出生日期 100%、性別 77%、證件號碼 100%、有效期限 100%。相較 `.15`，台胞證全欄 7/13→9/13，中文姓名 9/13→11/13；護照無退步。

`.16` joined-token Romanization 路徑已被實測證明有效：有 exact joined-token promotion candidate 2 張，最終實際選中 2 張；BOCA official promotion 仍維持 4 張、實際選中 4 張。最終 compatible 共 11 張，unknown 0，raw-row none 2。這與中文姓名 11/13 正確率一致。

剩餘 conflict subtype 匿名樣本數：token-count mismatch 5、one-syllable mismatch 2、other 0、unclassified 0。這些計數可重疊；但只剩 2 張最終沒有 raw-row 姓名，而既有 ground-truth 對照顯示這 2 張中文姓名錯誤樣本的正確姓名 **2/2 仍完整存在 raw row**。下一步應只針對最保守的 one-syllable 唯一候選條件，不再放寬 token segmentation、row distance 或任意 fuzzy spelling。

`.16` 已成為目前最佳基準：護照全欄 13/19；台胞證全欄 9/13、中文姓名 11/13。任何後續版本必須至少維持此基準。


## 2026-10-12 — `.17` 候選完成：只處理唯一 short/exact one-syllable mismatch

在 `.16` 已達到台胞證中文姓名 11/13、整張 9/13、護照 13/19 的目前最佳基準後，main 已完成 `.17` 候選。`.17` 不改 BOCA official promotion、不改 exact joined-token promotion、不恢復 row-distance fallback，也不做任意 fuzzy Romanization。

`.17` 唯一新增 production selector 規則：只有在沒有任何 compatible 或可接受 unknown candidate 時，收集所有 `compatibility=conflict` 且為 **2–4 個中文字、完整獨立 raw row** 的候選；若這類 short/exact conflict **恰好只有一個**，而且 subtype 正好是 `one-syllable-mismatch`，才回傳該候選並標記 `oneSyllableFallbackPromotion=true`。只要有第二個 short/exact conflict，或候選不是完整列、不是 2–4 字、不是 one-syllable mismatch，就不自動選。

此 fallback 保留 candidate 的 `compatibility='conflict'`，不假裝成 phonetic-compatible；因此 downstream confidence 仍是較保守的 row/conflict 路徑，人工審核語意不會被抬高。Validation 新增匿名指標：符合 one-syllable fallback 條件的樣本數、實際採用件數。

synthetic regression 已覆蓋：唯一 one-syllable 成功、非 exact 拒絕、5 字以上拒絕、存在第二個 short conflict 拒絕、compatible 優先、anchored unknown 優先、token-count conflict 不得誤採。版本 metadata 已更新為 `2026.10.11.17`。

`.17` 尚未在使用者 Windows 本機執行 `npm.cmd run verify:ocr`、Docker frontend rebuild 或 32 張 Validation，不能宣稱達到 13/13。GitHub Actions 仍 workflow_dispatch only，未執行。


## 2026-10-12 — `.17` 台胞證中文姓名達 13/13；main 已轉向 `.18` 性別證據修正

使用者完成 `2026.10.11.17` 正式 auto Validation，32/32 成功。護照維持全欄 68%（13/19）、中文姓名 68%。台胞證再提升：全欄 **77%（10/13）**、中文姓名 **100%（13/13）**、出生日期 100%、性別 **77%（10/13）**、證件號碼 100%、有效期限 100%。因此目前台胞證唯一剩餘非滿分欄位就是 sex，且 3 張整張錯誤可由 sex 77% 解釋。

`.17` one-syllable fallback 命中 2 張且實際採用 2 張；BOCA official promotion 4 張、joined-token promotion 2 張仍保留。最終 raw-row 姓名 13/13 都有結果，台胞證中文姓名正式達到 13/13。後續 **不得再調整姓名 selector**，除非新資料證明回歸；`.17` 姓名策略視為目前最佳基準鎖住。

### `.18` main 候選：sex evidence

檢查 `taiwanPermitMrz.ts` 確認 MRZ sex 字元位於 line1 index 22，但 composite checksum 使用 `slice(2,22) + slice(23,30)`，明確跳過 sex。故 `requiredValid=true` 也不能驗證 M/F 是否正確。

舊 `selectPermitSexCandidate()` 只有在 geometry labeled sex 與 semantic sex 同時一致且高分時，才允許覆蓋 MRZ；若 OCR raw row 已直接讀到 `性別女 / Sex F`，但 geometry label 沒抓到，仍會錯誤保留未受 checksum 保護的 MRZ sex。

`.18` 新增 `selectPermitSexEvidence()`：保留既有高分 visual-agreement 優先；若 **同列 strong semantic sex** 與 MRZ 衝突，允許 semantic-row override；沒有 strong semantic 時仍保留 MRZ。semantic parser 已抽成 `permitSexSemantics.ts`，只逐 row 接受同列 `性別男/女`、`男/女性別`、`Sex M/F`，不再把全部 OCR rows 串起來跨列湊字。

Validation 新增匿名 sex evidence：有 MRZ sex、geometry label、same-row semantic 各幾張；MRZ vs semantic conflict 幾張；其中 MRZ 其他 checksum 仍 requiredValid 幾張；最終來源 visual-agreement / semantic-row / MRZ / label / semantic / empty 各幾張。不保存旅客資料。

新增 executable tests：直接驗證 semantic-row 可覆蓋 MRZ、無 semantic 時 MRZ 保留、same-row parser 正負例（跨 row 不得誤判）、sex diagnostics aggregate/UI wiring。`npm.cmd run verify:ocr` 已納入 sex evidence test。pipeline metadata 為 `2026.10.11.18`。

`.18` 尚未在使用者 Windows 本機跑 verify/build 或 32 張 Validation，不能宣稱 sex 13/13。GitHub Actions 維持 workflow_dispatch only、未執行。


## 2026-10-12 — `.18` 無提升但定位 sex 缺失來源；main 已進入 `.19` standalone-token fallback

使用者完成 `2026.10.11.18` 正式 auto Validation，32/32 成功。護照維持全欄 68%（13/19）。台胞證維持全欄 77%（10/13）、中文姓名 100%（13/13）、出生日期 100%、性別 77%（10/13）、證件號碼 100%、有效期限 100%。因此 `.18` 沒有提高準確率，但姓名 13/13 無回歸。

`.18` sex evidence 診斷否定了原先 MRZ override 假設：13 張中 **MRZ 有性別 0 張**；geometry labeled sex 10 張；same-row semantic sex 3 張；MRZ vs semantic conflict 0；最終來源 visual-agreement 3、label 7、semantic-row override 0、MRZ 0、semantic fallback 0、**empty 3**。這 3 張 empty 正好解釋 sex 10/13，因此剩餘問題是「沒有抽到 sex evidence」，不是 MRZ 蓋掉正確值。

### `.19` main 候選：standalone sex token

- 不再調 MRZ priority，也不再碰已達 13/13 的台胞證姓名 selector。
- 新增 `permitStandaloneSexEvidence.ts`：只把 OCR detection box **整個文字恰好等於** `男`、`女`、`M` 或 `F` 視為 standalone sex token。`SEX F`、姓名英文、MRZ 整列等都不符合。
- 如果同張影像只有單一性別值（可有多個同值 token）則形成 standalone candidate；若同時出現 M 與 F，標記 conflict 並拒絕自動選。
- selector 優先序保持保守：visual-agreement > semantic-row conflict override > MRZ > labeled sex > semantic sex > **standalone-token fallback** > empty。也就是 standalone token 只在所有既有強證據都沒有時才生效。
- Validation 新增匿名 standalone 指標：有唯一 standalone sex token 的樣本數、M/F token 衝突樣本數、最終實際採用 standalone-token 的樣本數。
- executable tests 新增：男/女/M/F 單 token 正例、M+F 衝突拒絕、`SEX F` 不當 standalone；selector 測試保證 MRZ / label / semantic 都優先於 token；sex diagnostics/UI wiring 已同步。
- pipeline metadata 更新為 `2026.10.11.19`。

`.19` 尚未在使用者 Windows 本機執行 `npm.cmd run verify:ocr`、Docker rebuild 或 32 張 Validation，不能宣稱 sex 改善。若 `.19` 顯示 3 張 empty 樣本連 standalone token 都沒有，下一步直接做性別小區域重讀，不再繼續放寬 selector。


## 2026-10-12 — `.19` 再次提升：台胞證全欄 12/13、sex 12/13；下一步只剩 1 張 sex empty

使用者完成 `2026.10.11.19` 正式 auto Validation，32/32 成功。護照維持：全欄 68%（13/19）、中文姓名 68%、其他評估欄位 100%。台胞證提升到 **全欄 92%（12/13）**、中文姓名 **100%（13/13）**、出生日期 100%、性別 **92%（12/13）**、證件號碼 100%、有效期限 100%。相較 `.18`：sex 10/13→12/13、全欄 10/13→12/13；護照與姓名無回歸。

`.19` sex evidence 診斷：MRZ sex 0；geometry label sex 10；same-row semantic sex 3；有單一 standalone 男/女/M/F token 12；standalone M/F conflict 0；最終來源 visual-agreement 3、label 7、standalone-token fallback **2**、semantic-row override 0、MRZ 0、semantic fallback 0、**empty 1**。因此 `.19` 的 standalone-token fallback 已被實測證明有效，並且只剩 1 張台胞證完全沒有任何 sex evidence。

### 下一步 `.20` 方向

- **不再放寬 selector**。`.19` 已證明 selector 可在既有 OCR detection 中補回 2/3；最後 1 張是 detection/recognition 沒產生任何可用 sex evidence。
- `.20` 只針對 `finalSex === ''` 的台胞證啟動 focused sex retry：以正面版面性別欄附近的小區域 crop / re-OCR 為主，或以已偵測到的 Sex/性別 label 位置建立窄 ROI；不得對已經有 sex 的 12 張額外重跑。
- retry 結果只接受非常保守的 `男/女/M/F` 或 same-row Sex/性別語意；若 ROI 同時出現衝突值，維持 empty / 人工審核。
- 需要新增匿名 retry 診斷：sex retry 啟動件數、有文字框件數、有候選件數、實際覆寫件數、仍 empty 件數。不要記錄旅客內容。
- 中文姓名 `.17` 路徑已達 13/13，**禁止再動姓名 selector**，除非新資料出現回歸。

目前正式最佳基準：護照全欄 13/19；台胞證全欄 12/13、中文姓名 13/13、sex 12/13。`.20` 若能補回最後 1 張 sex，現有 13 張台胞證固定 Validation 將可達 13/13 全欄。

## 2026-10-12 — `.20` focused sex retry 已完成 main 候選（待本機驗證）

main 已完成 `2026.10.11.20` 候選，但**目前最佳真實照片 Validation 仍是 `.19`**，尚不能宣稱台胞證已達 13/13。

`.20` 僅在最佳方向／deskew 選定後且 `best.result.sex === ''` 時執行一次 focused ROI OCR；已經有 sex 的 12 張不會增加額外 OCR。若原 OCR geometry 有 `Sex`／`性別` label，使用 label 周圍窄 ROI；只有完全沒有 label geometry 時才使用正面版面 center-right 的保守 fixed-layout ROI。每張 empty permit 最多只做 **1 次** sex retry，不會先 label retry 再 fixed retry。

retry parser 只接受 ROI 內 detection box 完整等於 `男`／`女`／`M`／`F`，或同列 `Sex M/F`、`性別男/女`。所有候選會合併做 distinct-value 檢查；若同一 ROI 同時出現 M/F（或男/女）衝突，保持 empty，不猜。

新增匿名 diagnostics：retry 啟動件數、label/fixed ROI 件數、有文字框件數、有候選件數、衝突件數、實際補值件數、retry 後仍 empty 件數。沒有保存姓名、證號、raw OCR 文字、sample id 或影像。

新增 `permitSexRetry.ts` 與 `test-permit-sex-retry.mjs`，並納入 `npm.cmd run verify:ocr`；既有 sex diagnostics regression 同步擴充。台胞證姓名 selector、BOCA official、joined-token、unique one-syllable 路徑完全未改；row-distance fallback、MRZ sex override 假設亦未恢復。

下一個驗證點只有一次：使用者本機 `npm.cmd run verify:ocr` → Docker frontend rebuild → 確認頁面 pipeline `2026.10.11.20` → 同一組 32 張正式 auto Validation。若台胞證達 13/13 全欄，下一主要工作再轉回護照中文姓名 13/19。

## 2026-10-12 — .20 正式 Validation：台胞證全欄 13/13

2026.10.11.20 固定 auto Validation 32/32 完成、失敗 0。護照全欄和中文姓名 13/19，其餘七欄 19/19；台胞證全欄、中文姓名、出生日期、性別、證件號碼、有效期限全部 13/13。相較 .19，台胞證性別與全欄各新增 1 張正確，護照未退步。Focused sex retry 匿名診斷：started 1、label ROI 1、fixed ROI 0、detected text 1、candidate 1、conflict 0、applied 1、still empty 0。standalone-token 仍補回 2 張，姓名 selector 維持 13/13。此為 legacy 固定照片 Validation，32 張皆缺當時 OCR 工作輸入圖，不代表對新照片泛化達 100%。正式最佳實測為 .20；下一主要目標護照中文姓名 13/19。禁止 GitHub Actions，保留成功台胞證路徑。

## 2026-10-12 — `.21` 護照中文姓名 broad VIZ 受限放大候選（待 Validation）

接續 `.20` 已實測護照中文姓名 13/19、台胞證 13/13；六張護照錯誤中五張的 OCR 候選內容不符，故聚焦 recognition 輸入解析度，不照搬台胞證 selector。

護照 `predictOne()` 原本在第一個 `name-field` anchored crop 無法選出姓名時，使用固定 (x=.24, y=.12, width=.74, height=.58) 的 broad VIZ `createRelativeCrop`。此路徑對低解析圖不做有限放大。候選 `2026.10.11.21` 僅將此 broad VIZ 改為相同範圍的 `createPixelCrop(...,1500)`，用既有 2.5x 放大及 1800px 最大寬度保護。保持原本兩次裁切 OCR 順序，不增加 inference 次數；`chooseTaiwanChineseName` 的標籤、拼音及信心規則完全未修改；護照 MRZ 與台胞證 BOCA / joined-token / unique one-syllable / standalone token / focused sex retry 均未改。

新增 `frontend/scripts/test-passport-viz-crop.mjs` 靜態防退步測試，加入 `verify:ocr`；既有來源版本守衛同步調整為 `.21`。**候選尚未完成本機測試和 32 張 Validation，不能宣稱準確率提升。** 最佳已實測仍為 `2026.10.11.20`（護照 13/19、台胞證 13/13）。下一步集中跑 Windows `npm.cmd run verify:ocr` + Docker frontend rebuild + 32 張固定 Validation，比對護照中文姓名與台胞證是否回歸。不得上傳個資或執行 GitHub Actions。

## 2026-10-12 — .21 正式 Validation：護照中文姓名 14/19（74%）

使用者已在 Windows 本機完成 pipeline 2026.10.11.21 固定 32 張 auto Validation，32/32 完成、失敗 0。護照全欄正確 14/19（74%），中文姓名 14/19（74%），英文姓名、出生日期、性別、國籍、證件號碼、簽發國、有效期限皆 19/19。相較 .20 的 13/19，護照全欄與中文姓名各新增 1 張正確；護照 OCR 中位數約 1.3 秒、P90 約 2.4 秒。剩 5 張護照中文姓名錯誤，候選文字完整吻合 1 張、其他候選內容不符 4 張、原始 OCR 行完整吻合 0 張、較長文字內出現姓名 0 張。外交通行的拼音 shadow 改善 0 張；one-syllable shadow 潛在改善 1 張，尚未採用為正式 selector。

台胞證整張全欄、中文姓名、出生日期、性別、證件號碼、有效期限仍全數 13/13（100%）；focused sex retry 啟動 1、label ROI 1、候選 1、實際補值 1、仍空白 0。台胞證 OCR 中位數約 0.5 秒、P90 約 2.8 秒。

結論：.21 broad VIZ bounded-upscale 有固定 legacy Validation 淨改善，列為目前最佳已實測 pipeline。繼續護照中文姓名 recognition / ROI 方向，但不能推定對新照片泛化改善，也不可直接依 shadow 提示自動放寬姓名 selector。全部 32 張仍缺原始 OCR 工作輸入影像。保留台胞證 BOCA、joined-token、unique one-syllable、standalone sex、focused retry 已成功路徑。禁止 GitHub Actions，不上傳個資。

## 2026-10-12 — .22 護照姓名兩個 ROI 的匿名失敗歸因（候選待驗證）

.21 真實固定 Validation 已證明護照中文姓名 14/19（74%）、台胞證 13/13（100%），剩下 5 張護照姓名錯誤，其中 4 張 OCR 產生其他候選但非正確姓名、1 張雖有完整候選卻未被選中。不能直接推定需要放寬 selector。

.22 只改善已有 OCR 輸出的診斷：Validation 對錯誤護照樣本分開計算 name-field 與 broad VIZ 各自是否有完整正確候選、錯誤候選、無候選或該 crop 未執行，另彙總兩區都只有錯誤候選和正確候選僅在 VIZ 出現的件數。此分類是匿名 aggregate，使用過程中可短暫比較本機 ground truth，結果物件只留分類，UI 不顯示姓名、樣本 ID、影像或 OCR raw text。加入 regression/source wiring test，納入 verify:ocr。

**.22 不變更護照或台胞證辨識算法，也不增加任何 OCR inference。最佳已證明準確率仍是 .21（護照 14/19、台胞證 13/13）。** .22 的目的在固定 Validation 上一次分辨 remaining 5 張的 crop 缺口，再選擇下一批能有實質提升假設的辨識改善。執行 Windows verify:ocr、Docker frontend rebuild、32 張固定 Validation 後回填匿名結果；不可將診斷數字說成 accuracy 改善。禁止 GitHub Actions。

## 2026-10-12 — .22 正式 Validation：護照 14/19、台胞證 13/13；裁切分區診斷

使用者本機完成 2026.10.11.22 固定 auto Validation，32/32 完成、0 失敗。護照中文姓名與整張全欄均 14/19（74%），其他七欄 19/19；台胞證全部五個必要欄位及整張 13/13（100%）。.22 沒修改辨識算法，準確率與 .21 持平。

**護照 5 張失敗的匿名分區診斷**：name-field 正確候選 1、其他候選 2、無候選 0、未執行 2；broad VIZ 正確候選 0、其他候選 2、無候選 0、未執行 3；兩區都只有錯誤候選 0、正確候選僅在 VIZ 出現 0。全局失敗分類：完整候選吻合 1、其他候選內容不符 4、完整 raw row 0、raw substring 0、無可用候選 0。這些是原有 crop 輸出的匿名診斷，尚不足以確定個別字元錯誤根因。

觀察：不能再盲目加寬 broad VIZ；其在剩餘錯誤樣本中沒有完整正確候選，而 name-field 至少有 1 個正確候選但 selector 未採用。下一步先檢查未執行 crop 為何缺席（包含其他旋轉嘗試與合併結果的診斷），以及現有正確候選為何被拒絕；仍須避免直接放寬拼音衝突條件。最佳已實測 pipeline 為 .22（辨識準確率與 .21 相同）。所有 32 張 legacy Validation 缺少真正 OCR 工作輸入，不代表真實新照片泛化準確率。禁止 GitHub Actions，不得提交證件影像、真實姓名或 OCR raw 個資。

## 2026-10-12 — .23 護照 unknown-name VIZ 確認候選（待本機 Validation）

正式已實測基準 .22：護照中文姓名 14/19、台胞證全欄 13/13。分區診斷指出剩餘 5 張錯誤：name-field 完整正確候選 1、錯誤候選 2、未執行 2；broad VIZ 正確候選 0、錯誤候選 2、未執行 3。.22 完整輸出未執行不一定是 detection failure：程式 `predictOne()` 在 name-field 找到任一合格姓名時即 break，即使 romanizationStatus=unknown 也阻止 broad VIZ 嘗試。

.23 最小保守修正：若 name-field 選到明確 compatible 姓名，維持既有立即採用且不增加 OCR；若只選到 unknown，先保留其內容及來源作為人工審核候選，繼續執行原本已存在的 broad VIZ OCR；只有第二次 VIZ 選到 **明確 compatible** 姓名才覆寫 provisional 值，若仍 unknown／無候選則維持第一個姓名，不猜、不放寬 romanization selector。如此僅可能增加原本因 unknown 提前停止的護照 VIZ OCR，不更動台胞證任何已驗證路徑。新增 `test-passport-unknown-viz.mjs` 靜態守衛並加入 `verify:ocr`，pipeline 候選更新為 2026.10.11.23。

**.23 尚未跑 Windows verify/build 或 32 張固定 auto Validation，不得宣稱精準率提升；正式最佳實測仍是 .22 的 14/19 與 13/13。** 待集中本機驗證後，將匿名結果寫回文件。所有 legacy 32 張缺少真正 OCR 工作輸入圖像，不代表對新照片的泛化準確率。GitHub Actions 禁止執行，真實證件照片、姓名、號碼、raw OCR 個資不可上傳 GitHub。

## 2026-10-12 — .23 正式 Validation：護照 14/19 持平，VIZ 出現新正確候選

使用者本機完成 pipeline 2026.10.11.23 固定 auto Validation：32/32 完成、失敗 0。護照全欄與中文姓名仍 14/19（74%），其餘七欄 19/19；台胞證所有必要欄位及整張 13/13（100%），無回歸。護照 OCR 中位數約 1.2 秒、P90 2.3 秒。

護照剩餘 5 張錯誤的匿名裁切分區診斷：name-field 正確候選 1、其他候選 2、無候選 0、未執行 2；broad VIZ 正確候選 1、其他候選 2、無候選 0、未執行 2。兩區都只有錯誤候選 0；「正確候選僅在 VIZ 出現」0。全局失敗分類完整正確候選 1、其他候選內容不符 4、raw 完整吻合 0、raw 子字串 0、無可用候選 0。比 .22，VIZ 正確候選 0→1、未執行 3→2，但護照整張仍 14/19，故 .23 只能視為證據覆蓋增加，不能宣稱準確率提高。

下一步應針對正確候選與最終選擇之落差補充匿名決策歸因，特別是不同 ROI 的 decisionTrace、當次候選是否被拼音衝突或 rank/confidence gate 擋住，以及選定 orientation/attempt 與來源不一致的可能性；不直接把 shadow one-syllable suggestion 自動採用。台胞證已成功 BOCA / joined-token / one-syllable / standalone / focused-sex 路徑凍結。32 張 legacy Validation 均缺當年 OCR 工作輸入，不能推論新照片 production 100%。不啟動 GitHub Actions、不提交個資。

## 2026-10-12 — .24 護照正確候選的來源／拒絕原因歸因（待本機驗證）

正式已實測基準 .23：護照全欄／中文姓名 14/19（74%）、台胞證全欄 13/13（100%），32/32 固定 auto Validation 成功。.23 的 ROI 診斷顯示剩餘五張護照中文姓名錯誤中，name-field 與 broad VIZ 各出現一張正確候選，但最終仍未正確；分區 overlap 不代表兩張獨立樣本。

.24 只對既有「完整正確候選」decisionTrace 附加來源 `name-field`／`viz-crop` 與匿名原因彙總，判別 `selected-other-attempt`、拼音衝突 subtype、無錨點、信心門檻、unknown threshold 或其他 reject；UI 僅顯示 aggregate 件數。不儲存姓名、證件號碼、raw OCR、檔名或逐張資料。新測試 `test-passport-exact-source.mjs` 已接入 `verify:ocr`，pipeline 版本候選 `2026.10.11.24`。護照 selector、裁切、OCR 次數、台胞證已達 13/13 的路徑全部未改。

**本版本只有匿名診斷，不能宣稱超越 14/19；尚須本機 npm.cmd run verify:ocr、Docker frontend rebuild、固定 32 張 Validation。** 待觀察確切來源與拒絕分類後，才考慮保守修正。legacy 32 張沒有真正 OCR 工作輸入，不能推論新照片泛化準確率；禁止 GitHub Actions、branch/PR 微改與個資上傳。

## 2026-10-12 — .24 正式 Validation：護照 14/19，唯一正確候選被 one-syllable mismatch 擋住

使用者在 Windows 本機完成 pipeline 2026.10.11.24 固定 auto Validation：32/32 完成、0 失敗；護照全欄及中文姓名 14/19（74%），其餘七欄 19/19；台胞證全部五欄及全欄 13/13（100%）。與 .23 持平，無回歸。

護照剩餘 5 張姓名錯誤的匿名診斷：完整正確候選 1、錯誤候選內容不符 4、沒有可用候選 0；name-field 正確候選 1、其他候選 2、未執行 2；broad VIZ 正確候選 1、其他候選 2、未執行 2。新來源／拒絕原因診斷確定：**name-field / romanization:one-syllable-mismatch = 1 張**。其他來源／拒絕原因沒有出現。這解釋一張正確姓名已在 OCR 候選但未採用；不能由此推論所有 one-syllable mismatch 都安全，因拼音同音或多套拼法可能把不同人名混淆。

下一步檢查一個可逆、嚴格受限的候選接納政策：只限同一 name-field 中唯一完整獨立漢字候選、存在明確姓名 label/英文錨點、無其他 conflicting 合格候選、且 subtype 僅是 one-syllable-mismatch；必須用 synthetic tests 防止模糊採用與既有正確結果被改寫。先用匿名 shadow 對照驗證淨改善及退步風險，不可直接依 ground truth 作選擇或上傳真實姓名／OCR 文字。最佳實測 pipeline .24 準確率仍為護照 14/19、台胞證 13/13；32 張均缺真實工作輸入影像，不能宣稱新照片泛化。禁止 GitHub Actions。

