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
