# OCR PoC

最後更新：2026-09-29

## 目的

先證明「證件影像可以在瀏覽器內完成 OCR 推論」，並量測第一輪可用性，不急著把某一個 OCR 引擎定為正式方案。

## Baseline A：Tesseract.js 7

目前第一個 PoC 使用 Tesseract.js 7。

用途：

- 驗證瀏覽器端 Web Worker / WebAssembly OCR 流程。
- 測第一次模型載入時間。
- 測第二次以後的辨識時間。
- 觀察護照英文文字與 MRZ 的原始辨識效果。
- 建立可比較的 baseline。

限制：

- 此方案不是目前正式 OCR engine。
- Tesseract.js 本身不提供在瀏覽器內訓練／微調辨識模型的能力。
- 第一次執行時會下載 OCR runtime / language data；證件影像本身不會因此上傳到後端 API。
- 現階段只測護照，不同時加入身分證與台胞證。

## 目前 UI 輸出

每次測試會顯示：

- OCR 進度。
- 本次耗時。
- Raw OCR text。
- 從 raw text 中抓出的 MRZ candidate lines。

第一版 baseline 的 MRZ candidate 只是簡單字串篩選。第二版已加入：

- 自動裁切護照底部 MRZ 區域。
- 灰階與對比前處理。
- MRZ 專用 OCR pass。
- 字元白名單：A-Z、0-9、<。
- TD3 2 × 44 格式檢查。
- 護照號碼、出生日期、有效期限、個人號碼與 composite check digit 驗證。

只有在 MRZ 形成完整 2 × 44 時才進入正式欄位解析，不會為了湊格式任意補字。

## 下一個比較方向

若 baseline 不足，下一階段優先比較：

- ONNX Runtime Web。
- 可轉 ONNX / 可自行訓練的 PaddleOCR 類模型。
- WebGPU 與 WASM 執行差異。
- 是否值得針對護照、台灣身分證、台胞證建立各自模型／前處理流程。

## 評估時要記錄

至少記錄：

1. 使用的證件類型。
2. 圖片尺寸／檔案大小。
3. 第一次辨識時間。
4. 第二次辨識時間。
5. 姓名是否正確。
6. 護照號碼是否正確。
7. 出生日期是否正確。
8. 有效期限是否正確。
9. 國籍是否正確。
10. MRZ 是否完整。
11. 明顯錯字與錯誤類型。

正式方案不是只比較「哪個 OCR 看起來辨識字比較多」，而是比較真正需要的欄位準確率、速度、模型大小與可訓練性。


## Baseline A 實測紀錄

### 測試 1：整頁 OCR（同一張護照）

- 第一次辨識：約 3.81 秒。
- 第二次辨識：約 0.56 秒。
- 兩次都抓到 2 行 MRZ candidate。
- 第二次結果與第一次大致一致。
- 判斷：第一次時間主要受 OCR worker / model 初始化影響；同一頁面重用 worker 後，連續辨識速度明顯提升。

### 下一個實驗

同一張測試護照改跑「整頁 OCR + MRZ 專用 OCR」。

要觀察：

1. MRZ 專用 pass 是否能穩定產生兩行各 44 字元。
2. 護照號碼 check digit 是否通過。
3. 出生日期 check digit 是否通過。
4. 有效期限 check digit 是否通過。
5. composite check digit 是否通過。
6. 新增 MRZ pass 後的總耗時。

若格式與 check digit 仍不穩定，再比較更進一步的影像前處理或第二個 OCR engine。


### 測試 2：MRZ 第二行驗證成功

同一張測試護照在「整頁 OCR + MRZ 專用 OCR」流程中：

- 總耗時：約 1.25 秒。
- 整頁 OCR：約 0.69 秒。
- MRZ 專用 OCR：約 0.22 秒。
- 第二行 MRZ 已形成 44 字元。
- 護照號碼 check digit：通過。
- 出生日期 check digit：通過。
- 有效期限 check digit：通過。
- composite check digit：通過。

判斷：

- 護照號碼、出生日期、有效期限與第二行中的其他核心欄位，已具備可由 MRZ check digit 驗證的高可信度路線。
- 目前主要剩餘問題集中在第一行姓名區。
- 第一行若 MRZ 專用 OCR 漏掉，允許從整頁 OCR 的 P<... 候選 fallback，再只針對尾端 filler 做 TD3 規則正規化。
- 第一行姓名沒有與第二行相同層級的完整 check digit 保護，因此即使結構補成 44 字元，姓名仍需人工覆核。
