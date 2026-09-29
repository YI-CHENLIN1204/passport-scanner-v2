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

MRZ candidate 目前只是簡單字串篩選，不等於正式 ICAO MRZ parser，也還沒有做 check digit 驗證。

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
