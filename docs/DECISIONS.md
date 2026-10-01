# Decisions

最後更新：2026-10-01

## 已確認

### D-001：V2 使用者

V2 主要給旅行社內部人員使用，而不是直接開放旅客自助上傳。

### D-002：OCR 執行位置

OCR 推論在使用者瀏覽器端執行。V2 不把 OCR 搬到 Render / 雲端伺服器常駐執行。

### D-003：只蒐集有價值欄位

護照、台灣身分證、台胞證只辨識與旅行社作業、旅客識別、證件有效性或有合理 CRM 分析用途的欄位。

不因證件上「有這個欄位」就自動保存。

### D-004：國籍不可寫死

即使目前旅客以台灣人為主，護照國籍與簽發國仍依實際證件辨識，不固定為 TWN。

### D-005：台灣身分證檢查碼

台灣身分證 OCR 後必須執行檢查碼驗證。

### D-006：人工覆核

OCR 結果需經人工核對／修正，不採完全自動入庫。

### D-007：旅客主檔與證件版本分離

使用 traveler_master 表示旅客本人，document_versions 保存不同時間的證件版本。

### D-008：Google Sheets

V2 以人工按鈕觸發匯出 Google Sheets；不是 OCR 完成後即時同步。

### D-009：ERP

V2 不直接寫入 ERP。

### D-010：帳號與權限

V2 不投入複雜登入／角色權限管理；若未來增加第二位使用者，也不代表要立刻建立完整 RBAC。

### D-011：V2 開發骨架技術棧

V2 第一版開發骨架採：

- Frontend：Vue 3 + TypeScript + Vite。
- Backend：ASP.NET Core Web API / .NET 10 LTS。
- Frontend 開發 port：5173。
- Backend 開發 port：5080。
- 前後端透過 HTTP / JSON API 溝通。

此決策只鎖定應用程式骨架；OCR runtime 與正式資料庫仍需依 PoC / schema 階段決定。

## 現行規則，但需要持續評估

### P-001：證件照片保存

目前產品規則以「回國日 + 7 天」後刪除原始證件照片為基準。

但如果未來 OCR 準確率不足，需要累積經人工校正的資料進行再訓練／微調，保存期限可能需要重新評估，例如延長到數月。

**目前沒有確認永久保存。** 開發者不可自行取消刪除期限。

## 尚未定案

### O-001：出生地

出生地可能具有 CRM / 客群分析價值，因此比發照機關等欄位更有保留理由；但是否正式納入三類證件的必存欄位，仍需依實際分析用途決定。

### O-002：OCR 引擎與可訓練方式

目前已完成護照 OCR A/B 與第一輪泛化測試：

- Baseline A：Tesseract.js。
- Baseline B：PaddleOCR.js / PP-OCRv5。

在同一張 Tesseract 仍無法完成 TD3 的困難護照上，PaddleOCR 達成 44 / 44 且護照號碼、生日、有效期限、composite 四個關鍵 check digit 全部通過。

接著以 5 張不同護照／拍攝條件做泛化測試，加入「弱偵測時只重試底部 45% MRZ 區域」後，PaddleOCR 達成 **5 / 5 TD3 結構完成且 Line 2 關鍵 check digit 全部通過**。

**決策：V2 護照 OCR 主引擎正式採用 PaddleOCR.js / PP-OCRv5。**

- Tesseract.js 保留為開發 benchmark / PoC，不進正式護照主流程。
- MRZ Line 2 以 check digit 作為核心資料可信度驗證。
- Line 1 英文姓名仍保留人工覆核。
- Detection 弱或失敗時可啟用底部 45% MRZ fallback。
- fallback 的效能成本另行優化，不再以堆疊 Tesseract workaround 作為主要方向。

### O-003：照片訓練資料政策

若真的要把原始照片／人工校正結果用作訓練資料，需要另外決定：

- 保存多久。
- 是否與一般覆核照片分開。
- 哪些資料可進訓練集。
- 如何刪除。
- 如何避免將不必要的敏感欄位納入訓練。

### O-004：OCR runtime 與正式資料庫

應用程式骨架已確定為 Vue 3 + TypeScript + Vite / ASP.NET Core Web API (.NET 10)。

瀏覽器 OCR runtime 與正式資料庫仍需依 PoC 與資料模型階段決定；核心限制是 OCR 必須維持在瀏覽器端。


### D-012：護照人工覆核第一版

護照 OCR 主引擎確認為 PaddleOCR.js / PP-OCRv5 後，正式人工覆核 UI 第一版採「原始證件 + 可編輯結構化欄位」並列。

第一版欄位：

- 英文姓名。
- 護照號碼。
- 國籍。
- 簽發國。
- 出生日期。
- 性別。
- 有效期限。

MRZ check digit 可驗證的護照號碼、出生日期、有效期限標記驗證狀態；英文姓名始終保留人工覆核。

目前按下「確認資料」只更新前端覆核狀態，不直接入庫、不建立旅客主檔／證件版本，也不自動匯出 Google Sheets。後端持久化需在資料模型與 API 契約確認後另行接入。


### D-013：人工覆核畫面優先於技術診斷

正式使用流程中，PaddleOCR 辨識完成後應直接顯示護照人工覆核卡；OCR 初始化時間、TD3、runtime 等技術診斷資訊置於覆核流程之後，避免內部使用者先閱讀開發資訊才找到操作區。

人工覆核日期顯示與編輯格式採 `YYYY-MM-DD`。OCR / MRZ 驗證層仍保留原始 `YYMMDD`，以免破壞 check digit 驗證來源；日期世紀由前端做可人工修正的推定。


### D-014：正式操作流程與開發診斷分離

護照主流程只顯示：

1. 選擇證件。
2. PaddleOCR 護照辨識。
3. 人工覆核。
4. 確認前端覆核草稿。

Tesseract Baseline A、TD3 細節、runtime、批次泛化測試等資訊全部收進開發診斷區，不再佔據旅行社員工的主要操作流程。

### D-015：護照覆核欄位驗證與 draft

人工覆核介面加入：

- 英文姓名／護照號碼／國籍／簽發國格式驗證。
- 日期使用 YYYY-MM-DD。
- 性別使用選單。
- 護照過期顯示 warning，但不阻止「資料覆核」本身。
- 修改 OCR 值時顯示修改欄位，並可一鍵還原本次 OCR。
- 按下確認後記錄 reviewedAt。
- 確認後再次修改任一欄位，確認狀態與 draft 立即失效。

確認時建立 typed PassportReviewDraft，但目前只存在瀏覽器記憶體，不送 API、不入庫。Payload 格式見 `docs/PASSPORT_REVIEW_CONTRACT.md`。


### D-016：人工覆核後先做後端第二層驗證

護照人工覆核按下確認後，前端先建立 `PassportReviewDraft`，再送到：

`POST /api/passport-reviews/validate`

後端重新驗證姓名／護照號碼／國家代碼／日期／性別／OCR metadata 等格式。

此 endpoint **只驗證、不持久化**：

- 不建立 traveler_master。
- 不建立 document_versions。
- 不保存圖片。
- 不寫 Google Sheets。
- 回應不 echo 姓名、護照號碼等敏感值。

等 API contract 穩定後，再新增真正的資料庫 transaction。

### D-017：原圖縮放與拖曳列為覆核 UX 強化

人工覆核卡維持左側原圖、右側可修改欄位。後續加入圖片縮放與拖曳／平移，方便操作人員局部核對證件內容；此 UX 強化不阻塞目前資料流與資料模型開發。


### D-018：資料庫未定案前以 ITravelerStore 驗證版本邏輯

正式資料庫尚未鎖定，因此後端先以 `ITravelerStore` 作為資料層邊界，開發環境使用 `InMemoryTravelerStore`。

目的不是把記憶體儲存當正式資料庫，而是先把以下業務規則跑通：

- 新旅客 + 第一個護照版本。
- 同一本護照重複掃描不重複建立版本。
- 同一旅客換新護照建立新 document version。
- 舊護照重新掃描不會重新變成 current。
- 多位 exact-match 候選不自動合併。

正式資料庫選定後，只替換 `ITravelerStore` 實作，前端 `PassportReviewDraft` 與 API contract 不重寫。

### D-019：CI 作為前後端最基本品質門檻

GitHub Actions 在 push / pull request 時執行：

- ASP.NET Core `dotnet build`。
- Vue / TypeScript `npm run build`（包含 vue-tsc）。

目前 TypeScript 固定於 5.9.x，以維持現有 vue-tsc 相容性。


### D-020：台灣護照中文姓名由 VIZ OCR + 人工覆核取得

MRZ 不含中文姓名，但 CRM 需要台灣旅客中文姓名，因此護照流程新增 VIZ parser。

- 繼續使用同一個 PP-OCRv5_mobile_rec；該模型本身支援繁體中文、簡體中文、英文與日文。
- 先使用整頁 OCR 結果，找不到可靠中文姓名才做 VIZ crop fallback。
- 中文姓名候選需排除固定護照標籤，並優先採用靠近「姓名」標籤的中文字串。
- 台灣護照中文姓名為人工覆核必填欄位。
- OCR 失敗時人工輸入，不從英文名自動音譯。
- 非台灣護照沒有中文姓名時允許 NULL / 空值。

### D-021：旅客主檔與證件版本都保存中英文姓名

`traveler_master` 保存目前 CRM 採用的 `name_zh` / `name_en`。

`document_versions` 另外保存 `name_zh_on_document` / `name_en_on_document`，確保換發護照、羅馬拼音變更後仍保留歷史版本當時的姓名。

台灣旅客換護照的 exact-match 優先使用「中文姓名 + 出生日期 + 國籍」；沒有中文姓名的護照才退回英文姓名比對。


### D-022：中文姓名採欄位定位優先，不信任整頁 confidence

實測證明 VIZ OCR 即使 confidence 超過 95% 仍可能辨識到錯的中文欄位或錯字，因此中文姓名自動填值改採：

- 不接受整頁中文字候選直接進 CRM。
- 優先以「姓名」標籤座標動態裁切姓名欄。
- 以 MRZ 英文姓名作為 Name group 的第二位置錨點。
- 只有欄位位置合理的中文字串才可作為 autofill 候選。
- 動態裁切失敗才使用 broad VIZ fallback。
- 沒有可靠候選時留空，不以高 confidence 強行填值。

中文姓名仍必須人工對照原始護照確認。


### D-023：MRZ 英文姓名只作中文姓名交叉驗證，不反向猜中文字

台灣護照中文姓名 OCR 加入 MRZ romanization 輔助：

- 先由姓名欄位置取得中文候選。
- 再將中文字轉為拼音，與 MRZ surname / given names 的羅馬拼音逐音節比較。
- 支援常見台灣舊式羅馬拼音別名，以降低 HSUAN/XUAN、HSIA/XIA、KUEI/GUI 等制度差異造成的誤判。
- 字數／音節數明顯不符，或大部分音節相符但單一字讀音明顯衝突時，候選不得 autofill。
- 羅馬拼音只能作 veto / supporting signal，不可用來反向推定正確中文字，因為同音字可能很多。
- 無法判斷時留空人工輸入，不以 OCR confidence 強行採用。

例：MRZ 為 LIN / HAI / SHENG，而 OCR 候選為「林海注」（LIN / HAI / ZHU），第三音節衝突，因此拒絕 autofill，但系統不會自動把「注」改成「生」。


### D-024：人工覆核原圖支援縮放與拖曳

護照人工覆核卡左側原始證件已加入：

- 100%～400% 縮放。
- 滾輪／按鈕縮放。
- 放大後拖曳平移。
- 一鍵「適合視窗」與雙擊重設。

這些操作只改變瀏覽器畫面 transform，不修改或重新上傳原始證件圖片。
