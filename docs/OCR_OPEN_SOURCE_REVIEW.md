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
