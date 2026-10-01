# Passport Review Draft Contract

此文件定義護照人工覆核完成後，前端準備給未來後端 API 的結構化資料格式。

目前狀態：**前端建立 draft 後送到 `POST /api/passport-reviews/validate` 做後端第二層格式驗證；驗證成功後仍不入庫、不匯出 Google Sheets。**

## Payload

```json
{
  "schemaVersion": 2,
  "documentType": "passport",
  "chineseName": "測試旅客",
  "englishName": "SURNAME, GIVEN NAMES",
  "passportNumber": "XXXXXXXXX",
  "nationality": "TWN",
  "issuingState": "TWN",
  "birthDate": "YYYY-MM-DD",
  "sex": "M",
  "expiryDate": "YYYY-MM-DD",
  "verification": {
    "passportNumberCheckDigit": true,
    "birthDateCheckDigit": true,
    "expiryDateCheckDigit": true,
    "compositeCheckDigit": true
  },
  "reviewAssertions": {
    "chineseNameVisuallyConfirmed": true,
    "englishNameVisuallyConfirmed": true
  },
  "ocr": {
    "engine": "paddleocr-ppocrv5",
    "line2Validated": true,
    "chineseNameSource": "viz-crop",
    "chineseNameScore": 0.93,
    "fallbackUsed": false,
    "averageScore": 0.91
  },
  "reviewedAt": "2026-10-01T00:00:00.000Z"
}
```

## 欄位原則

- `chineseName`：人工覆核後的中文姓名。台灣護照從 VIZ OCR 建議值帶入，沒有 MRZ check digit。
- `englishName`：人工覆核後的英文姓名，不宣稱有 check digit 保護。
- `passportNumber`：人工覆核後的護照號碼。
- `nationality`：3 碼國籍代碼，不固定為 TWN。
- `issuingState`：3 碼簽發國代碼，不固定為 TWN。
- `birthDate` / `expiryDate`：UI 與未來 API 使用 `YYYY-MM-DD`。
- OCR / MRZ 驗證層仍保留原始 `YYMMDD`，不以 UI 日期取代原始驗證來源。
- `verification`：保留 OCR 當下的 MRZ check digit 驗證結果，讓未來 audit / review 判斷可追溯。
- `ocr`：只保存必要的 OCR metadata；不包含完整 raw OCR text 或證件影像。
- `reviewedAt`：人工按下確認時的時間。

## 不在這個 payload 的資料

第一版不包含：

- 原始證件影像 binary。
- 完整 raw OCR text。
- MRZ 完整原文。
- 發照機關、發照地、換證次數等未確認業務價值欄位。
- traveler_master / document_versions 的資料庫 ID。
- 團別、訂單、Google Sheets 工作表 ID。

這些關聯等資料模型正式確認後再由後端 API contract 擴充，不先把 UI PoC 的暫時欄位綁死成資料庫 schema。

## 確認與修改規則

- 使用者按下「確認資料」才建立 draft。
- 確認後若任何欄位再被修改，原 draft 立即失效並回到待覆核。
- 可使用「還原 OCR」回到本次 OCR 初始值。
- 格式錯誤時不可確認。
- 護照已過期目前列為 warning，不阻止資料覆核；後續旅行作業是否可使用該證件屬另一層業務規則。


## 目前 API 階段

`POST /api/passport-reviews/validate`

用途：

- 接收人工覆核完成後的結構化 draft。
- 在後端重新執行格式與基本一致性驗證。
- 不記錄完整 request body 到 log。
- 不建立 traveler_master。
- 不建立 document_versions。
- 不保存證件圖片。
- 不寫 Google Sheets。

成功回應只包含：

- accepted。
- persistence = validated-only。
- receivedAt。
- warnings。

不把護照號碼、姓名等個資 echo 回前端。

下一階段才會另外設計真正的 persistence endpoint 與 traveler / document version transaction。


## 暫時持久化 API

`POST /api/passport-reviews`

此 endpoint 會先執行和 validate endpoint 相同的後端驗證，再交給 `ITravelerStore`。

目前實作為 `InMemoryTravelerStore`，只用來驗證：

- 新旅客建立。
- 同一本護照重複掃描不重複建立版本。
- 同一旅客換新護照建立新 document version。
- 舊護照重新掃描不會重新變成 current。
- 多位 exact-match 候選時回傳 409 conflict，不自動合併。

成功回應不 echo 個資，只回傳內部 ID、action、版本數與 warning。

目前 persistence 值為 `volatile-in-memory`，**後端重啟後全部清空**。這不是正式資料保存。

`GET /api/passport-reviews/store-status` 只回傳旅客數與證件版本數，不回傳姓名、護照號碼等敏感資料。


## 英文姓名的額外人工確認

TD3 Line 1 沒有像 Line 2 的護照號碼／生日／效期那樣具有可獨立驗證的 check digit，因此「Line 2 全部通過」不能推導英文姓名正確。

正式流程要求：

- Line 1 必須先通過 TD3 結構檢查（`P<`、3 碼簽發國、`SURNAME<<GIVEN<NAMES`）。
- 一般頁面文字即使以 P 開頭且長度接近 44，也不可當成 MRZ Line 1。
- 若 Line 1 不可信，PaddleOCR 自動改用底部 MRZ crop 重試。
- 人工覆核卡的英文姓名必須由使用者勾選「已對照原圖確認英文姓名正確」。
- 後端要求 `reviewAssertions.englishNameVisuallyConfirmed = true` 才接受保存。
- 英文姓名一旦再修改，人工確認勾選會自動失效，必須重新核對。


## Schema v2：中文姓名

V2 CRM 需要旅客中文姓名，但護照 MRZ 本身不包含中文姓名，因此 schema v2 新增：

- `chineseName`
- `reviewAssertions.chineseNameVisuallyConfirmed`
- `ocr.chineseNameSource`（`name-field` 或 `viz-crop`）
- `ocr.chineseNameScore`

台灣護照規則：

- 中文姓名為必填。
- OCR 值只作建議，必須人工對照原始護照。
- OCR 抓不到時留空，由操作人員人工輸入。
- 不允許從英文姓名自動音譯中文姓名。
- 中文姓名修改後，人工確認狀態立即失效。
- 後端只有在中文姓名與英文姓名都完成必要人工確認後才接受保存。

非台灣護照：

- 沒有中文姓名時允許空字串。
- 不為了 CRM 強行翻譯或音譯。
