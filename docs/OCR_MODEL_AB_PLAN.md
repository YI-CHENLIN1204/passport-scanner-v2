# 護照中文姓名：辨識模型 A/B — 執行門檻與決策（2026-10-12）

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
