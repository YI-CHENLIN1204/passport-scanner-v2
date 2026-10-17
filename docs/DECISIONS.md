# Decisions

最後更新：2026-10-09

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

> **歷史決策，已被 D-035 / D-037 與目前 CSV 匯出流程取代。**

早期規劃曾考慮由人工按鈕觸發 Google Sheets 匯出。現行 V2 不做 Google Sheets 寫入；正式匯出為團別頁手動 CSV，支援依證件類型選表、欄位勾選與順序調整。

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

此段最後一句屬早期階段狀態，已由 D-002、D-034 與後續 OCR 決策取代。現行實作固定為瀏覽器端 PaddleOCR / parser pipeline + PostgreSQL 16；應用骨架仍為 Vue 3 + TypeScript + Vite / ASP.NET Core Web API (.NET 10)。

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

> **此項主要內容已由 D-041、D-043、D-046、D-068 與 D-072 定案；保留此段作早期待辦歷史。**

現行規則是 production 覆核照片與私人 Training Dataset 分離；只有人工明確選入且完成審核的樣本才複製至 `training_samples`。production 圖片仍依回國日後 7 天清除；Training sample 保留獨立 image / OCR input / ground truth，並以 source scan item FK 保持可追溯。

### O-004：OCR runtime 與正式資料庫

> **已定案，不再屬於「尚未定案」。**

現行為 Vue 3 + TypeScript + Vite / ASP.NET Core Web API (.NET 10)，OCR 在瀏覽器端使用 PaddleOCR / MRZ / parser pipeline；正式資料庫為 PostgreSQL 16。OCR 不搬到雲端常駐推論，資料庫細節見 D-034。


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

此段描述的是第一版 PoC 歷史狀態。現行正式批次流程在人工審核後會以 transaction 寫入 Traveler / DocumentVersion 與本團 TourMemberDocument；匯出為 CSV，不再使用 Google Sheets。


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

typed PassportReviewDraft 為早期 PoC 契約；現行正式批次流程會把 OCR 結果寫入 scan staging，人工審核後才持久化 Traveler / DocumentVersion。舊 contract 仍保留作 validate-only / 技術歷史參考。


### D-016：人工覆核後先做後端第二層驗證

護照人工覆核按下確認後，前端先建立 `PassportReviewDraft`，再送到：

`POST /api/passport-reviews/validate`

後端重新驗證姓名／護照號碼／國家代碼／日期／性別／OCR metadata 等格式。

此 validate endpoint 本身仍維持「只驗證、不持久化」語意，但它已不是正式批次收件的唯一流程。現行系統另有正式 persistence / scan review endpoints，人工審核後以 PostgreSQL transaction 寫入 Traveler / DocumentVersion 與團別關聯。

### D-017：原圖縮放與拖曳列為覆核 UX 強化

人工覆核卡維持左側原圖、右側可修改欄位。後續加入圖片縮放與拖曳／平移，方便操作人員局部核對證件內容；此 UX 強化不阻塞目前資料流與資料模型開發。


### D-018：資料庫未定案前以 ITravelerStore 驗證版本邏輯

> **歷史 PoC 決策，正式 persistence 已由 D-034 取代。**

早期在資料庫尚未鎖定時，以 `ITravelerStore` 作為資料層邊界並用 InMemory 實作驗證版本邏輯；目前 `ITravelerStore` abstraction 仍保留，但正式實作為 PostgreSQL。

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


### D-025：身分證暫緩，先完成台胞證

目前台灣護照中文姓名 OCR 已證明中文欄位定位與辨識仍需要持續泛化測試。為了加快 V2 可用版本進度，台灣身分證暫緩；第二種正式證件先做台胞證。

台胞證第一版欄位：

- 中文姓名。
- 8 位台胞證號碼。
- 出生日期。
- 性別。
- 有效期限。

簽發次數、簽發機關、曾持證加註等欄位不保存。

### D-026：後端改為多證件共用 ITravelerStore

原本護照專用 persistence 改為 `SaveDocumentReview`，護照與台胞證共用 traveler / document_versions 規則。

同時新增：

- `GET /api/travelers`：旅客搜尋。
- `GET /api/travelers/{id}`：旅客與證件版本明細。
- `GET /api/document-store/status`：旅客／證件版本數量。

這些 API 是下一階段 CRM 前端的資料來源。

### D-027：正式介面分為「證件掃描」與「旅客資料」

主畫面開始從 OCR PoC 轉為實際工作台：

- 證件掃描：護照、台胞證；此處「身分證暫緩」為當時階段狀態，已由 D-030 取代，現行三類證件皆為 V2 正式證件。
- 旅客資料：搜尋 traveler_master 並查看 document_versions。
- Tesseract 與舊泛化測試仍保留在開發診斷區，不放進主要操作流程。


### D-028：電子台胞證改為背面機讀碼優先

重新查證 2015 版電子台胞證規格後確認：背面具有依 ICAO Doc 9303 TD-1 設計的證件機讀碼。

因此修正先前 VIZ-only 假設：

- 台胞證核心流程改為背面 3 × 30 機讀碼。
- 證號、出生日期、有效期限使用機讀碼 check digit 驗證。
- 中文姓名優先嘗試由機讀碼姓名編碼取得。
- 正面 VIZ OCR 降級為沒有背面照片／MRZ 不可讀時的 fallback。
- 身分證仍暫緩，避免專案再次被高比例中文 OCR 泛化阻塞。

### D-029：護照與台胞證皆支援自動方向校正

兩種證件都不要求使用者事先把照片轉正。辨識流程可嘗試 0° / ±90° / 180°，必要時再做小角度 deskew；覆核畫面顯示校正後圖片，但保留原始檔不變。


### D-030：台灣身分證恢復為 V2 第三種正式證件

D-025 的「身分證暫緩」屬階段性決策。台胞證正面 OCR 經實測完成自動旋轉、欄位語意解析與人工覆核後，確認同一套 PP-OCRv5 + 人工覆核框架足以支援身分證，因此身分證正式恢復到 V2。

第一版只保存：

- 中文姓名。
- 國民身分證統一編號。
- 出生日期。
- 性別。

不保存發證日期、發證地點、領補換類別等目前沒有直接業務價值的欄位。

### D-031：身分證字號檢查碼必須前後端各自驗證

國民身分證統一編號：

- 第 1 碼為英文區域碼。
- 第 2 碼為性別碼；本國國民身分證為 1 / 2。
- 第 10 碼為檢查碼。

前端 OCR 完成後立即計算檢查碼；後端保存前再次獨立計算。只要格式或檢查碼失敗，就不能直接保存。

性別由第 2 碼交叉驗證；OCR 未可靠取得身分證字號時，性別不得自行預設。

### D-032：三種證件共用自動方向校正

護照、台胞證、台灣身分證都不要求客戶先把照片轉正。

辨識時會：

1. 嘗試原方向。
2. 結構不足時比較 ±90°，必要時 180°。
3. 將欄位完整度、驗證結果與 OCR 文字框長邊是否水平一起評分。
4. 必要時再做小角度 deskew。
5. 覆核畫面顯示校正後影像，但不修改原始上傳檔。


### D-033：內部上傳版允許遠距照片自動放大；客戶端改為即時拍攝品質引導

V2 目前仍是內部人員上傳既有照片，因此不能假設旅客已依系統規格重新拍攝。三種正式證件都要容忍「證件只佔整張手機照片一小部分」的情況。

內部上傳版：

- 護照、台胞證、台灣身分證共用遠距照片 fallback。
- 整張照片 OCR 太弱時，系統自動裁中央較大的候選區域並放大後再次 OCR。
- OCR 可使用放大 crop，但人工覆核仍顯示完整照片。
- 系統選出正確方向後，必須把相同旋轉／deskew 套回完整照片供人工覆核，不可只讓 OCR crop 轉正。
- 遠距 fallback 是容錯機制，不要求內部操作人員為既有照片重新向客戶索取。

未來客戶端：

- 不以「拍完後自動救圖」作為主要 UX。
- 相機預覽階段即時提示拍攝品質，例如：再靠近一點、稍微退後、證件未完整入框、請轉正、光線不足、反光過強、畫面模糊。
- 品質達標後才建議拍攝／自動觸發拍攝。
- 後端／OCR 的遠距與旋轉 fallback 仍保留作最後一道容錯，不取代前端即時引導。


### D-034：V2 正式資料層切換 PostgreSQL

V2 的旅客主檔與證件版本不再使用 `InMemoryTravelerStore` 作為實際保存位置。

正式資料層：

- ASP.NET Core + Entity Framework Core。
- Npgsql PostgreSQL provider。
- Docker Compose 內建 PostgreSQL 16 service。
- `travelers` 保存旅客主檔。
- `document_versions` 保存護照、台胞證與台灣身分證歷史版本。
- PostgreSQL 使用 named volume `passport_scanner_postgres`，一般 container 重啟或 rebuild 不刪資料。

`ITravelerStore` 保留作為資料層 abstraction，讓未來若切換到外部 PostgreSQL／Supabase PostgreSQL 時，不需要重寫前端或 review API。

本機 Compose 預設密碼只用於開發；正式部署必須由環境變數或 secrets 注入。


### D-035：V2 目前產品邊界是「團別證件掃描與匯出」

目前階段不開發旅客客戶端，也不做 CRM 串接。

V2 正式主流程：

1. 旅行社員工建立或選擇團別。
2. 進入該團後上傳／掃描旅客證件。
3. 護照、台胞證、台灣身分證在瀏覽器端 OCR。
4. 人工覆核後，證件資料掛到目前團別的團員。
5. 團別頁查看目前已建檔團員與各自已完成的證件種類。
6. 完成後以按鈕整團匯出。

這個階段的成功標準是「一團一團處理證件並能輸出」，不是建立跨團 CRM 客戶 360 主檔。

資料庫底層仍可保留 traveler/document version abstraction 以避免重寫既有 OCR review pipeline，但它不是目前產品 UI，也不代表已進入 CRM 階段。

目前新增：

- `tours`
- `tour_members`
- `GET /api/tours`
- `POST /api/tours`
- `GET /api/tours/{id}`
- `GET /api/tours/{id}/export.csv`

三種證件覆核儲存都可帶 `tourId`，成功後自動把該旅客掛入目前團別。


### D-036：團別不保存預計人數

證件掃描系統的團別不保存「預計人數」。

原因：

- 客人會隨銷售與報名逐筆進來，人數本來就是流動的。
- 包團同樣可能有人員增減，預計人數沒有穩定的業務價值。
- 團體卡片直接以目前實際 `tour_members` 數量顯示人數即可。
- 「最低出團人數」若未來需要，屬於 ERP 的產品／出團管理規則，應在 ERP 建團或產品設定階段處理，不屬於證件掃描 V2。

因此目前建立團別的基本資料只需要：

- 團別名稱
- 出發日
- 回國日

另外設定「此團實際需要收哪些證件」；這是 Scanner 的證件工作需求，不是 ERP 的預計人數或最低成團人數。

團別人數永遠由實際已掛入該團的團員資料動態計算。


### D-037：團別只顯示與處理該團需要的證件

證件掃描 V2 不固定顯示護照、台胞證、身分證三個欄位。

建立團別時直接設定此團實際需要收集的證件種類，例如：

- 國旅：可只設定台灣身分證。
- 一般出境：可只設定護照。
- 大陸團：可設定護照 + 台胞證。

團別頁、團員證件狀態表、證件掃描類型選單與整團 CSV 匯出，都只顯示或輸出該團 required_document_types 中的證件。

不把「國旅／一般出境／大陸團」本身硬編碼成 Scanner 的複雜業務規則；Scanner 只保存該團這次實際需要收哪些證件。如此未來 ERP 串接後，也可以直接由 ERP 把證件需求帶進 Scanner。


### D-038：批次掃描採待審核暫存層

證件 OCR 完成後，不要求使用者立即逐張人工覆核，也不直接寫入正式 Traveler Master。

正式流程為：

1. 使用者在團別中選擇證件類型並批次上傳圖片。
2. OCR 在瀏覽器端依序處理。
3. OCR 結果、人工覆核所需圖片與原始辨識資料寫入 scan staging。
4. 掃描完成後立即出現在團別工作區，狀態為待審核。
5. 使用者可之後再開啟審核視窗逐位旅客處理。
6. 人工按下審核儲存後，才透過既有 Traveler / DocumentVersion 流程寫入正式主檔。

目前 staging 資料表：

- scan_batches：一次同團別、同證件類型的批次上傳。
- scan_items：每張證件的 OCR 結果、覆核圖片與審核狀態。
- tour_person_drafts：系統目前判定屬於同一個人的暫存群組。

scan_items 的圖片只供內部人工覆核使用；辨識仍在瀏覽器執行，不因 OCR 將原始照片送往第三方服務。圖片刪除期限依該團回國日後 7 天規則保存。

### D-039：跨證件人物比對採共同欄位完全相同自動合併

> **早期策略已被 D-052、D-053、D-060、D-063、D-064 取代。現行不再把「姓名 + 出生日期 + 性別」視為足以強制合併的唯一身份鍵，且已提供人工 Traveler merge。**

早期曾以三種證件共同欄位作為自動歸組基礎：

- 中文姓名
- 出生日期
- 性別

系統先正規化中文姓名空白與性別格式，再以三個欄位完全相同作為同一人的自動歸組鍵。

不使用模糊姓名相似度，也不提供人工「合併人物」按鈕。

若 OCR 初次辨識錯誤，導致同一真人暫時形成兩個 tour_person_drafts，允許先保留為兩筆。人工審核的責任只是在證件原圖旁修正 OCR 欄位；當修正後三個共同欄位與既有暫存人物完全相同，後端必須自動重新歸組成同一人。

正式 Traveler Master 也採同一個 exact identity key。若歷史錯誤資料在修正後產生完全相同人物，DocumentVersion 與 tour_members 關係由後端自動搬到 canonical Traveler，不要求使用者人工處理資料合併。

### D-040：V2 正式操作介面改為 Sidebar + 獨立功能頁

正式介面不再將團別、掃描、OCR、人工覆核與開發測試工具全部堆在 App.vue 單頁。

主要導覽：

- 團別管理
- 證件掃描
- 旅客資料

團別列表、單一團別工作區、批次掃描與旅客主檔為獨立頁面。單一團別工作區負責顯示已收證件、待審核狀態與開啟人工覆核視窗。

開發用 OCR benchmark / generalization test 不放在正式操作介面。


### D-041：OCR 訓練資料與正式收件照片分離

OCR 模型改善資料不得透過取消 production 照片刪除期限來累積。

正式規則：

- `scan_items` 的覆核照片仍遵守該團回國日後 7 天的 production 保存規則。
- 人工審核畫面提供「保留此樣本供 OCR 改善」選項，預設不勾選。
- 只有操作人員明確勾選且完成審核後，系統才把該證件圖片、OCR 原始輸出與人工 ground truth 複製到獨立 `training_samples`。
- `training_samples` 現在以 FK 追溯 source scan item（D-068），但 production retention 只清除 `scan_items` 的圖片 bytes、不刪 scan row，因此不會因 production 圖片到期而刪除已選入的訓練樣本；Training Dataset 影像仍為獨立副本。
- 不可因為要訓練模型，就自動把所有旅客證件永久保存。

### D-042：OCR Benchmark 同時衡量準確率與速度

護照、台胞證、台灣身分證共用 OCR 品質頁。

Benchmark 以 `ocrPayloadJson.originalFields` 對人工審核後欄位做 exact-match，比較內容不直接回傳個資到統計 API。

至少統計：

- 各欄位 exact-match rate。
- 整張證件全部必要欄位 exact-match rate。
- 人工修正率。
- Average / Median / P90 OCR 時間。
- 平均 orientation attempts。
- fallback 使用率。

每種證件約 30–50 張可先做中期分析；約 100 張可做第一輪較穩定的正式分析。這些數量只作分析成熟度參考，不是自動解除 OCR 凍結的門檻；是否重新進入 fine-tune / parser 改善仍必須符合 D-072 的 Dataset 與評估 gate。

### D-043：訓練資料匯出為私人 Dataset ZIP

OCR 品質頁允許匯出已明確選入的 `training_samples`。

Dataset ZIP 以隨機 sample ID 命名檔案，不以旅客姓名或證號作檔名；內容包含原圖／覆核圖、OCR 原始 payload、人工 ground truth 與 manifest。

ZIP 含真實身分證件資料，只能放在受控私人儲存位置，不得提交 GitHub。Repository 的 `.gitignore` 必須持續排除 training data、export、checkpoint 與 private model。


### D-044：本機 PostgreSQL 必須支援可攜式備份與還原

V2 目前使用 Docker named volume 保存 PostgreSQL；named volume 只存在該台電腦，不會隨 Git repository 移動。

因此專案正式提供：

- `scripts/backup-db.ps1`：以 PostgreSQL custom-format dump 備份完整資料庫。
- `scripts/restore-db.ps1`：在另一台電腦重建並還原資料庫。
- 備份預設放在 `backups/`，並由 `.gitignore` 排除。
- `*.dump` 不得提交 GitHub，因為內容可能包含旅客主檔、證件圖片、ground truth 與私人 OCR Dataset。
- 備份完成時同時產生 SHA256 sidecar；restore 若找到 sidecar，必須先驗證 hash。
- restore 在停止 frontend/backend、DROP 正式資料庫之前，先把 dump 複製進 PostgreSQL container 並執行 `pg_restore --list` 確認 archive 可讀。
- hash 不符或 archive 不可讀時必須在破壞性操作前中止；既有正式資料庫不可因壞備份而先被刪除。

換電腦、重設 Docker Desktop 或進行可能刪除 volume 的操作前，應先建立資料庫備份。


### D-045：團別與旅客資料提供後端條件篩選

隨著正式旅客與團別數量增加，V2 不只依靠瀏覽器端已載入資料做假篩選。

旅客資料查詢支援：

- 姓名／證件號碼文字搜尋。
- 目前證件類別。
- 性別。
- 國籍。
- offset / limit 分頁。

團別管理查詢支援：

- 團別名稱。
- 收件狀態：尚未收件、收件中、待審核、收件完成。
- 此團需要的證件類別。
- 出發日期區間。

篩選條件由 API / PostgreSQL 查詢處理；既有簡單呼叫仍保留預設參數，避免影響證件掃描頁等既有流程。


### D-046：Production 證件照片保存期限由背景工作實際執行

\`scan_items.delete_after\` 不再只是紀錄欄位。

ASP.NET Core backend 會啟動 production photo retention background worker：

- 啟動後立即檢查一次。
- 之後約每小時檢查一次。
- 到達 \`delete_after\` 的 \`scan_items\`，清除 production \`image_bytes\` 與 OCR input image bytes。
- OCR 結構化欄位、人工審核結果、Traveler / DocumentVersion 與團別資料繼續保存。
- \`training_samples\` 是人工明確選入後建立的獨立副本，不會因 production 圖片到期而被刪除。
- production 圖片已刪除後，不允許再新加入 OCR Training Dataset。
- 尚未人工審核的資料若照片已到期，不允許在沒有原圖的情況下完成審核；仍可刪除該待審核項目。
- 審核介面顯示 production 照片保存期限，過期後明確顯示照片已依規則刪除。


### D-047：旅客資料可查看歷史證件版本

\`document_versions\` 的歷史版本不是只在資料庫保留。

旅客資料頁的編輯視窗：

- current 證件仍可編輯。
- 非 current 的歷史證件版本以唯讀方式顯示。
- 至少顯示證件類別、證件號碼、證件姓名、有效期限與最後確認時間。
- 歷史版本不提供直接改成 current 的 UI，避免操作人員誤改版本狀態。




### D-048：掃描批次具有正式生命週期並顯示最近批次

`scan_batches.status` 不再是只建立後永遠維持 `OPEN` 的欄位。

正式流程：

1. 建立批次時狀態為 `OPEN`。
2. 瀏覽器依序完成 OCR，成功的證件才寫入 `scan_items`。
3. 所有檔案都已嘗試處理後，前端把本批 `attempt_count` 與 `failed_count` 一起送到批次完成 endpoint。
4. `item_count` 代表當時成功加入待審核的張數，並驗證 `attempt_count = item_count + failed_count`。
5. 後端將批次改為 `COMPLETED`。
6. `COMPLETED` 批次不可再新增 scan item；重複呼叫完成保持 idempotent。
7. 若瀏覽器／電腦在中途離開，該批維持 `OPEN`，用來辨識未正常結束的掃描工作。

批次完成後若操作人員刪除某張待審核資料，不回頭改寫該批當時的成功張數；批次統計代表「當次掃描執行結果」，不是目前剩餘 scan item 數量。

團別工作區顯示最近 5 個掃描批次，包含：

- 證件類型。
- 成功張數／總嘗試張數。
- 失敗張數。
- 已完成／尚未結束狀態。
- 最後更新時間。

`OPEN` 只代表尚未走到正式完成點；它可能仍在另一個分頁處理，也可能是先前中斷，因此 UI 不直接把它標成失敗。


### D-049：批次 OCR 執行期間防止誤離開掃描頁

批次 OCR 仍在執行時，系統應避免使用者因誤操作造成 `OPEN` 批次中斷。

目前正式行為：

- BatchScanPage 對上層回報目前是否正在執行批次。
- 掃描進行中時，Sidebar／頁內導覽不允許切離掃描頁。
- 瀏覽器上一頁在批次進行中會恢復到目前掃描頁並提示使用者。
- 重新整理、關閉分頁或關閉視窗時使用瀏覽器原生離頁警告。
- 批次所有圖片處理完成並成功結束後，自動解除導覽保護。

這個保護只避免意外中斷，不改變瀏覽器端 OCR 架構，也不把 OCR 搬到後端背景執行。


### D-050：批次失敗項目可單獨重跑，成功項目不重複處理

批次完成後若部分圖片 OCR／寫入失敗：

- 畫面保留每張檔案的成功／失敗狀態。
- 提供「只重跑失敗 N 張」。
- Retry 會建立新的 scan batch，只處理目前失敗的圖片。
- 已成功加入待審核的圖片不重新 OCR、不再次建立 scan item。
- 每次 retry 都各自記錄 attempt / success / failed，保留真實批次歷史。
- 若批次完成後再加入新圖片，「開始辨識」只處理尚未成功的項目，不重跑既有成功項目。
- 使用者若移除失敗項目，也不會讓既有成功項目重新變成待處理狀態。

這個規則避免因少數失敗圖片造成整批重跑與重複 staging。


### D-051：團別實際收件與全域 DocumentVersion 分離

正式 Traveler / DocumentVersion 是跨團共用的旅客主檔；團別不能再因為 Traveler 已經有某張 current 證件，就自動視為「本團已收到」。

因此新增 \`tour_member_documents\`：

- \`tour_members\`：表示這位 Traveler 已有正式資料掛入這一團。
- \`tour_member_documents\`：表示這一團實際採用／收到哪一個 DocumentVersion。
- 同一個 tour member、同一個 document type 只保留一個目前採用的版本。
- 人工審核完成時，除了建立／更新 Traveler 與 DocumentVersion，也必須建立或更新本團的 document link。
- 團別詳情、已收證件數、缺件判斷與 CSV 只以本團 document link 為正式收件依據，不自動拿 Traveler 其他 current 證件補齊。
- 舊 reviewed scan item 在啟動 migration 時會依 \`saved_document_version_id\` backfill 到新關聯表。

已審核 scan item 可以從團別移除：

- 刪除的是本團 scan item、production 收件關聯與對應 training sample。
- 不刪除全域 Traveler。
- 不刪除全域 DocumentVersion。
- 若同團同人同證件類型仍有其他 reviewed scan item，會自動回退到最近一筆剩餘版本。
- 若沒有任何正式證件 link，該 Traveler 的 tour member 會從此團移除。
- 已審核資料再次修改，若人物身份被改成另一個 Traveler，也必須重新計算舊 Traveler 在本團的 document link，避免殘留重複團員。

Traveler 自動合併時，\`tour_member_documents\` 必須跟著 \`tour_members\` 搬移並依 document type 去重，不能因人物合併遺失團別收件關係。


### D-052：已存在的 Traveler 支援人工明確合併

自動人物比對仍以身分證字號優先，其次才使用姓名／生日／性別；但若 OCR 或人工資料造成同一真人已經被建立成兩個正式 Traveler，系統必須提供人工合併，而不是要求使用者直接改資料庫。

人工合併採「來源 → 保留主檔」：

- 操作人員明確指定哪一筆 Traveler 保留。
- 另一筆 Traveler 合併後刪除。
- 保留 Traveler 的中文姓名與既有主檔為準；來源資料只補保留主檔目前為空白的英文姓名、國籍、身分證字號。
- 來源的全部 DocumentVersion 移到保留 Traveler。
- 來源的 TourMember / TourMemberDocument 一起移動；若兩人已同時存在同一團，合併成一個 TourMember，證件 link 依 document type 去重。
- 同類型有多個 current DocumentVersion 時，沿用既有 current reconciliation 規則，只保留最近確認版本為 current；歷史版本不刪除。
- reviewed scan item、draft identity 與已選 Training Sample 的 ground truth 要同步到保留 Traveler；Training split 本身依 DocumentVersion 的 TravelerId 動態分組，因此 DocumentVersion 搬移後，同一真人會自動回到同一 split group。

為降低誤合併風險：

- 保留與來源不能是同一 Traveler。
- 出生日期不同時禁止合併。
- 性別不同時禁止合併。
- 兩邊都有身分證字號且內容不同時禁止合併；必須先人工確認／修正。
- UI 必須同時顯示兩邊身份與證件摘要。
- 使用者必須勾選「我已確認是同一位旅客」，並再次確認，才真正執行。
- 合併目前不提供 UI undo；需要復原時使用資料庫備份處理。

### D-053：多筆人物候選不得只靠姓名／生日／性別自動合併

V2 人物歸組採保守策略：

- 有合法身分證字號且找到相同身分證字號 Traveler：可視為強識別，允許自動歸組／整理重複資料。
- 沒有身分證字號，或身分證字號找不到既有 Traveler 時，才使用中文姓名 + 出生日期 + 性別作為次級比對。
- 次級比對只命中 1 位 Traveler 時，可自動把新證件掛到該 Traveler。
- 次級比對命中 2 位以上時，不再自動把這些正式 Traveler 合併；Review API 回傳 `409 ambiguousTravelerMatch`，由操作人員到「旅客資料」確認並人工合併。
- 新證件帶有身分證字號時，姓名／生日／性別候選若已有另一個不同的非空身分證字號，該 Traveler 不列入自動匹配候選。

目的：避免同名同生日等低機率但高影響情境造成錯誤合併。既然 V2 已提供人工 Traveler merge，就優先保留可人工解決的重複資料，而不是冒險自動合錯人。

### D-054：正式旅客資料的強識別驗證必須在資料層執行

前端 OCR、人工審核與旅客編輯都可以提供即時提示，但不能把正式資料完整性只交給前端。

目前正式規則：

- `NationalIdNumber` 只要非空，就必須通過台灣國民身分證統一編號格式與 checksum。
- `TAIWAN_NATIONAL_ID` 的 DocumentNumber 本身必須通過同一套 checksum，且與 Traveler NationalIdNumber 一致。
- 有合法身分證字號且 Traveler 性別為明確 M/F 時，性別必須與身分證第 2 碼一致。
- 人工編輯 Traveler 時，如果身分證字號已屬於另一位 Traveler，禁止直接寫入並提示使用 Traveler merge。
- 人工修改 DocumentVersion 時，如果同類型同證件號碼已存在於另一個 DocumentVersion，禁止直接製造重複；跨 Traveler 衝突應先人工確認／合併。
- 正式 Review、批次 Review 與 Traveler edit 最終都必須經過 backend / persistence 層驗證，不能靠前端是否曾經驗過來保證。

### D-055：資料 migration / backfill 只補缺，不覆寫正式業務狀態

`tour_member_documents` 的啟動 backfill 只用來把升級前既有 reviewed scan item 補成新的 per-tour document link。

- 若 `tour_member_id + document_type` 已有正式 link，backfill 使用 `ON CONFLICT DO NOTHING`。
- backend 重啟不能重新用歷史 scan item 覆寫目前已由人工審核、刪除 fallback、Traveler merge 等正式流程決定的 link。
- migration 應保持可重複執行且非破壞性。

### D-056：舊單張 Review API 也必須先驗證團別收件範圍

雖然正式內部 UI 主要使用批次 scan/review 流程，legacy 單張 review endpoints 仍存在，因此不能允許它們繞過 Tour required document types。

- 若帶 `tourId`，先確認 Tour 存在。
- 再確認該 Tour 的 `required_document_types` 包含這種證件。
- preflight 通過後才可建立／更新 Traveler 與 DocumentVersion。
- 不允許 API 最後回 404/400，但前面的正式旅客／證件資料已經先寫進資料庫。

### D-057：護照流程不得假設所有旅客都有中文姓名

V2 支援外國護照；正式身份資料與團別畫面不得把「中文姓名存在」當成所有 Passport Traveler 的必要條件。

- 台灣護照（nationality 或 issuing country 為 TWN）仍必須人工確認中文姓名。
- 台胞證與台灣身分證仍必須有中文姓名。
- 外國護照允許中文姓名空白，但英文姓名必須存在。
- Traveler 主檔允許中文姓名空白，只要英文姓名存在。
- 外國 Traveler 的次級人物匹配在中文姓名空白時使用「英文姓名 + 出生日期 + 性別」。
- 若英文身份條件命中多位 Traveler，仍視為 ambiguous，不自動合併。
- 團別統計、待審核人物卡與正式團員畫面在中文姓名空白時使用英文姓名作為 identity/display fallback。
- 待審核 draft grouping 在中文姓名空白時使用既有 scan item 的英文姓名 + 出生日期 + 性別，不為此額外擴充 draft schema。
- CSV 與歷史團別仍以該團實際 link 的 DocumentVersion 為準，不因 Traveler 後來改名或換證而改寫過去團別使用的證件版本。

### D-058：性別內部值統一，但審核 UI 跟隨證件標示

Traveler / ScanItem / DocumentVersion 相關流程的性別 canonical value 繼續使用 `M`、`F`、`X`，避免人物比對、篩選、CSV 與既有資料出現兩套值。

操作畫面則依正在核對的證件呈現：

- 護照：顯示 `M / F / X`。
- 台灣身分證：顯示 `男 / 女`，實際儲存仍為 `M / F`。
- 台胞證：顯示 `男 / 女 / X`，實際儲存仍為 `M / F / X`。
- Traveler 主檔編輯與跨證件篩選不屬於單一證件畫面，顯示 `男 (M) / 女 (F) / X`，讓使用者同時理解中文語意與 canonical value。

目的：人工審核時讓畫面文字盡量與證件實際印刷內容一致，但不為了 UI 顯示建立第二套資料格式。

### D-059：Traveler merge 不可默默改變本團使用的不同證件

人工或自動整理重複 Traveler 時，如果兩筆 Traveler 已同時存在於同一團，TourMemberDocument 必須保守處理。

- 同一團、同一證件類型若兩邊指向同一本證件 identity（同類型、同證件號碼；護照另含 issuing country），可視為重複 link，合併後只保留一筆。
- 同一團、同一證件類型若兩邊指向不同證件 identity，系統不得依 updatedAt、current version 或其他推測自動選擇。
- 此情況直接阻止 Traveler merge，提示操作人員先回團別移除不正確的本團證件，再重新執行旅客合併。
- 阻止合併時整個 merge transaction rollback，Traveler、DocumentVersion、TourMember 與 TourMemberDocument 都不可留下半套變更。

目的：Traveler 主檔合併是在確認「兩筆是同一個人」，不代表系統有權順便決定某一團實際應使用哪一本不同證件。

### D-060：團別統計不得用姓名碰撞合併兩位正式 Traveler

團別 `memberCount`、收件進度與操作列必須和正式 Traveler 邊界一致。

- 已建立的正式 TourMember / Traveler 一律以 TravelerId 視為獨立人物，不因中文姓名、英文姓名、出生日期、性別相同而互相去重。
- 待審核 draft 若有 NationalIdNumber，只在唯一命中一位正式 Traveler 時與該 Traveler 視為同一人。
- 沒有 NationalIdNumber 時，可用中文姓名或英文姓名 + 出生日期 + 性別比對，但只有唯一命中一位正式 Traveler 才去重。
- 若命中 0 位或 2 位以上正式 Traveler，draft 保持獨立，不猜測、不隱藏任何正式 Traveler。
- `receivedDocumentCount` 使用同一套人物映射，避免 reviewed scan item 與正式 TourMemberDocument 重複計數。

這條規則與 D-053 的 ambiguous traveler 策略一致：寧可暫時多顯示一筆待確認資料，也不能把兩個真人因低強度 identity 欄位相同而壓成同一人。

### D-061：「儲存並審核下一位」以 Traveler 為優先單位

審核視窗同一位旅客可以切換多張證件，因此「下一位」不等於「下一張 scan item」。

- 儲存目前待審核證件後，優先尋找另一位仍有 PENDING 證件的 draft person。
- 若其他旅客都沒有待審核資料，但目前這位仍有另一張 PENDING 證件，才留在目前這位並切到下一張待審核證件。
- 全部待審核資料都完成後才關閉審核視窗。

### D-062：編輯團別日期不得讓待審核照片立即失效

`scan_items.delete_after` 會隨團別回國日重新計算，但團別日期修改不能在使用者不知情的情況下讓 PENDING 原圖立即超過 retention cutoff。

- 編輯團別時先依新回國日計算 production photo delete-after。
- 若新的 cutoff 已經早於／等於目前時間，而且本團仍有 `PENDING` 且 image bytes 尚存在的 scan item，拒絕這次團別修改。
- 操作人員必須先完成審核或刪除這些待審核資料，再把回國日改到會立即過期的日期。
- 已審核資料不阻止日期修改；其 production 圖片仍依正式 retention 政策清除，Training Dataset 為獨立副本。
- 被拒絕的團別修改不可改變 tour 日期或既有 scan item 的 `delete_after`。

### D-063：待審核 draft grouping 與正式 Traveler 採相同保守原則

`tour_person_drafts` 只是人工審核前的暫存人物分組，不能因為它不是正式主檔就採更冒險的人物合併。

- 合法 NationalIdNumber 相同屬強識別；同一團可將多個相同身分證字號 draft 整理成同一 draft。
- 沒有強識別時，中文姓名或英文姓名 + 出生日期 + 性別只在唯一命中一個既有 draft 時自動掛上。
- 弱條件同時命中 2 個以上 draft 時，不做 consolidation；新 scan item 保持獨立 draft。
- 新 scan item 有合法身分證字號時，若某弱匹配 draft 內已有另一個不同的合法身分證字號，該 draft 不得列入候選。
- 人工審核修正出合法身分證字號後，如果發現目前 draft 的其他 scan item 有不同合法身分證字號，這張證件必須拆出，不可因姓名／生日相同繼續黏在一起。

目的：待審核人物卡的自動分組只負責降低操作量，不能先於人工審核把兩位真人不可逆地揉成同一人。

### D-064：已審核 scan item 以 SavedDocumentVersion 關聯正式 Traveler

一旦 scan item 完成人工審核並產生 `saved_document_version_id`，團別統計與前端人物列不應再依姓名猜它屬於哪位 Traveler。

- `ScanItemResponse` 對內提供 `savedDocumentVersionId`。
- 後端團別 summary 先由 `saved_document_version_id -> document_versions.traveler_id` 精確映射 draft 到正式 Traveler。
- 前端團別人物列先以 `savedDocumentVersionId` 對照本團正式 member documents。
- 只有沒有可用正式關聯時，才依序退回 NationalIdNumber 唯一命中，再退回姓名／英文姓名 + 出生日期 + 性別唯一命中。
- 若正式 link 同時指向多位 Traveler，視為資料不一致，不再用弱身份條件強行去重。

目的：人工審核完成後，正式外鍵關係的可信度高於任何姓名／生日推測，尤其避免同名旅客被重複顯示或錯誤去重。

### D-065：Legacy scan backfill 不得猜 Traveler，SavedDocumentVersion 為正式 FK

舊版 reviewed scan item 可能沒有 `saved_document_version_id`，啟動 migration 只能在關聯唯一時補資料。

- 以 document type + document number，比護照時再加 issuing country 找 DocumentVersion。
- 只有符合條件的 DocumentVersion 全部唯一屬於同一位 Traveler 時，才允許 backfill `saved_document_version_id`。
- 若同一證件 identity 歷史上跨多位 Traveler 出現，保持 NULL，不使用 `ORDER BY ... LIMIT 1` 猜一位。
- `scan_items.saved_document_version_id` 正式設為指向 `document_versions.document_version_id` 的 foreign key。
- FK 採 `ON DELETE SET NULL`：若 DocumentVersion 未來真的被刪除，保留 scan history，只解除正式證件關聯。
- 對既有資料庫加 constraint 前，若發現指向不存在 DocumentVersion 的 orphan UUID，先清成 NULL。

目的：migration 只修復能確定的舊資料，不在背景啟動流程替操作人員做身份猜測。

### D-066：同一 Traveler／證件類型只能有一筆 Current DocumentVersion

`DocumentVersion.IsCurrent` 是正式資料規則，不只是 UI 標籤。

- 同一 `traveler_id + document_type` 最多只能有一筆 `is_current = true`。
- 換證時先將同類型舊 current 版本轉為 historical，再建立新的 current 版本。
- Traveler merge 後重新 reconcile current documents；若兩邊都有 current，同類型只保留 `VerifiedAt` 最新，其次 `CreatedAt` 最新的版本。
- 啟動既有資料庫時，若歷史資料已有多筆 current，先依相同排序規則修復，再建立 PostgreSQL partial unique index。
- 團別的 `TourMemberDocument` 可以繼續引用 historical DocumentVersion；全域 current 不等於某一歷史團別當時使用的證件。

資料庫以 partial unique index `ux_document_versions_one_current_per_type` 強制這條 invariant。

### D-067：Traveler PersonalId 欄位降級為 Legacy Compatibility

`travelers.personal_id_type / personal_id_number` 保留是為相容早期資料與搜尋 fallback，不再視為正式證件真相來源。

- 正式證件內容與 current/historical 狀態一律以 `document_versions` 為準。
- 旅客搜尋仍可保留 PersonalIdNumber fallback，避免非常舊的 legacy Traveler 因缺 DocumentVersion 而突然搜不到。
- Traveler merge 後，若原 PersonalId 仍對應一張 current DocumentVersion，保持不變。
- 若原 PersonalId 已變 historical，改指向目前仍為 current 的 DocumentVersion；優先採 `VerifiedAt` 最新，其次 `CreatedAt` 最新。
- 不因 PersonalId 欄位內容反向覆寫 DocumentVersion。

### D-068：Training Sample 必須保留可追溯 Source Scan Item

`training_samples.source_scan_item_id` 是 Training Dataset 的來源追溯關聯，不只是一般文字欄位。

- 一個 scan item 最多只能對應一個 training sample。
- `training_samples.source_scan_item_id` 必須 foreign key 到 `scan_items.scan_item_id`。
- FK 採 `ON DELETE CASCADE`，直接刪除 source scan row 時不可留下 orphan training sample；其 evaluation baseline 依既有 FK 一併清除。
- production photo retention 只清除 scan item 的圖片 bytes，不刪 scan row，因此不會因 retention 觸發 training sample cascade。
- Training Dataset 自己保存的 image / OCR input image 仍是獨立訓練副本，不受 production image retention 影響。

目的：訓練資料可以獨立保存影像，但仍要能追溯到哪一筆人工覆核 scan 產生，且資料庫不能留下無來源樣本。

### D-069：Traveler 人工編輯不可繞過正式證件 Identity 規則

「旅客資料」允許修正已審核資料，但修正後仍必須符合目前 current DocumentVersion 所代表的正式身份限制。

- 若 current documents 包含台灣身分證、台胞證，或國籍／簽發國為 TWN 的護照，Traveler 中文姓名不可清空。
- 若存在 current 台灣身分證，Traveler `NationalIdNumber` 必須等於該 current 身分證號；前端即使送 null，也不得把主檔字號清掉而留下正式身分證版本。
- 只要 Traveler 有合法台灣身分證字號，性別必須為 M 或 F，並與字號第 2 碼一致。
- 外國護照且沒有台灣身分證字號時仍可使用 X，不因這條規則限制。
- API 必須從資料庫實際 current documents 重新判斷，不假設前端一定把所有 current document 都送回。

目的：人工編輯是修正可信資料，不是繞過掃描人工覆核 validation 的另一條入口。

### D-070：超過 Production Photo Retention Cutoff 的團不得再新增掃描收件

production 證件照片保存期限仍以團別回國日後 7 天為準，因此新收件不能在寫入當下就已經過期。

- 建立 scan batch 前先計算 `ProductionPhotoDeleteAfter(tour.ReturnDate)`；若 cutoff 已小於或等於目前時間，拒絕建立新批次。
- 每張 scan item 寫入前再次檢查 cutoff，防止批次建立後團別日期被改成過期日期。
- 過期團別仍可保留、查詢既有正式旅客與歷史資料；限制的是新的 production 圖片收件。
- 若確實需要重新收件，操作人員應先確認並修正團別日期，而不是讓新照片以已過期的 `delete_after` 寫入。
- 此規則與 D-062 相同目的：不可讓 PENDING 人工審核資料在使用者不知情時立即失去原圖。

### D-071：Historical DocumentVersion 對一般旅客編輯保持唯讀

D-047 已將非 current 的歷史證件版本定義為唯讀顯示；backend API 同樣必須遵守，不能只靠前端隱藏輸入框。

- `UpdateTraveler` 只允許修改屬於該 Traveler 且 `IsCurrent = true` 的 DocumentVersion。
- request 若指定 historical DocumentVersion，直接拒絕，不修改歷史證件內容。
- historical version 保留當時人工確認的證件快照與版本歷程，不因後續一般主檔修正被靜默覆寫。
- 若未來確實需要修正歷史資料，應建立明確的歷史修正／稽核流程，不與一般 Traveler edit 混用。

### D-072：累積到資料不等於立即重新調整 OCR

目前 OCR recognition / parser 仍以固定 Test baseline `2026.10.09.1` 凍結。正式系統開始累積人工覆核資料後，資料先用於建立可靠 Dataset 與觀察真實錯誤分布，不因「已經有一些資料」就立即修改 OCR。

重新開啟 OCR 改善至少需要同時滿足以下 gate：

- 樣本必須經人工覆核，ground truth 可被信任。
- 三類證件要有足夠的不同真人、拍攝角度、裝置、光線與品質分布；不能主要由少數人的多角度照片組成。
- Train / Validation / Test 依 Traveler group 分離，同一真人不可跨 split。
- 固定 Test split 不拿來反覆調 threshold / parser / model，也不因目前表現不佳把困難樣本移出。
- 已有固定 baseline 與可重跑的評估流程，能比較修改前後，而不是靠單張照片觀感。
- 改善方向應由 Train / Validation 與真實錯誤分類決定；Test 只用於最後泛化確認。
- 每次只調整可歸因的一組變因，避免 model、threshold、parser、orientation 同時改動而無法判斷效果。
- 使用者明確決定重新開啟 OCR 改善階段後，才解除目前凍結。

因此目前新資料的優先用途是：收集 → 人工覆核 → 建立 ground truth → 維持 split integrity → 累積 benchmark；V2 系統本體與資料正確性仍優先於 OCR 調參。

### D-073：強識別相同仍不得忽略明顯身份衝突

D-053 仍維持「合法且相同的 NationalIdNumber 可作為強識別並自動整理重複 Traveler」，但強識別不是覆蓋一切矛盾資料的理由。

- 找到相同合法身分證字號 Traveler 時，先確認既有 Traveler 的出生日期與性別是否和本次人工覆核資料一致。
- 若任一相同字號 Traveler 的出生日期或性別互相衝突，視為資料完整性異常，不自動 consolidate。
- Review API 回 `409 ambiguousTravelerMatch`，提示操作人員到「旅客資料」人工確認／修正。
- 衝突發生於正式 review transaction 中時，前面對 Traveler / DocumentVersion 的暫時修改必須 rollback。
- 姓名不同本身不構成阻擋條件，因姓名可能有更名、OCR 修正或中英文表記差異；出生日期與性別則屬明顯 identity conflict。

目的：強識別可降低重複資料，但不能把歷史誤填的身分證字號轉化成不可逆的錯誤合併。

### D-074：Production photo retention cutoff 是存取截止，不等待 worker 才生效

`delete_after` 是 production 證件照片的正式存取期限；hourly background worker 只是實體 bytes 清理機制，不應把保存期限延長到下一次 worker 執行。

- `delete_after <= now` 後，production image endpoint 立即視為不存在，即使 bytes 尚未被 background worker 清除。
- review queue 的 `imageAvailable` 同樣以 cutoff + bytes 共同判斷；超過 cutoff 立即為 false。
- PENDING scan item 到 cutoff 後不得完成人工審核，即使 DB bytes 暫時仍存在。
- 已超過 cutoff 且尚未建立 Training Sample 的 scan item，不得再把 production image 新複製進 Training Dataset。
- 已經在 cutoff 前人工選入 Training Dataset 的獨立 training image 不受 production cutoff 影響，仍依 Training Dataset 規則保存。
- background worker 持續約每小時執行，負責最終把 `image_bytes / ocr_input_image_bytes` 從 production scan row 清除。

目的：保存政策的法律／隱私語意由 `delete_after` 決定，不因背景排程延遲而多出最多約一小時的可讀取窗口。

### D-075：固定 Test baseline 樣本不可被一般取消或刪除流程移除

一旦 `training_samples` 已建立對應的 `ocr_evaluation_baselines`，該樣本已成為固定 benchmark 的一部分；一般資料整理操作不得讓固定 Test 集合默默縮水。

- `SetSelection(..., selected: false)` 若發現 Training Sample 已有 evaluation baseline，直接拒絕。
- reviewed source scan item 的一般刪除流程會先取消 Training Sample，因此同樣不得刪除已建立固定 baseline 的來源 scan item。
- 被拒絕時 Training Sample、EvaluationBaseline 與 source ScanItem 必須全部保持不變。
- production photo retention 不受此限制：production bytes 仍依 D-074 到期清除；固定 Test 使用的是 Training Dataset 已保存的獨立副本。
- 目前 V2 不提供一般 UI/API 直接刪除 evaluation baseline。
- 若未來確實要更換固定 Test，應建立獨立、明確且可稽核的 reset / rebaseline 流程，不得借用「取消用於訓練」或「刪除證件」操作。

目的：固定 Test 的樣本集合必須穩定，避免因一般資料維護把 26 張固定基準悄悄變成 25 張，造成不同 OCR 版本比較失真。

### D-076：含固定 baseline 的 Traveler group 永久鎖在 Test split

一般 Training Dataset split 仍使用 Traveler / draft group key 的 deterministic SHA256 70/15/15，因此新增其他旅客樣本不會讓既有 group 洗牌；但 Traveler merge 可能改變 group key。

- 若某 Training Sample 已有 `ocr_evaluation_baselines`，它所在的目前 Traveler group 一律指定為 `test`，不再重新套用 hash split。
- 同一 group 的其他 Training Sample 一起進入 `test`，避免同一真人一部分在 Test、一部分跑到 Train / Validation 造成資料洩漏。
- Traveler merge 後重新計算 group 時，只要合併後 group 內仍有任一 fixed baseline sample，整個新 group 仍鎖 Test。
- 沒有 fixed baseline 的 group 完全維持既有 deterministic 70/15/15 規則。
- 新增一般樣本不會改變固定 baseline 本身；同一 fixed-Test Traveler 後續新增的樣本可能一起落入 Test，固定 benchmark 的 baseline 樣本數則仍以 `ocr_evaluation_baselines` 為準。

目的：固定 Test 的核心是固定比較樣本與防止同人跨 split，不是強迫所有時點 Train / Validation / Test 的百分比永遠精確等於 70/15/15。

### D-077：固定 Benchmark cohort 必須在第一次 OCR 執行前原子凍結

固定 Test 不能以「哪幾張第一次 OCR 成功」決定 membership，否則第一次重測途中失敗的困難樣本會被永久排除，造成 benchmark selection bias。

- 當資料庫尚未存在任何 evaluation baseline 時，第一次固定 Test 執行先依當下 deterministic Test split 算出完整 cohort。
- backend 以單一 transaction 為 cohort 內每張 Training Sample 建立 `state = pending` 的 baseline reservation，再開始瀏覽器 OCR。
- `pending` 只表示固定 membership 已建立、尚未成功產生第一版 OCR baseline；它不能拿來當實際辨識結果計分。
- OCR 成功後，`SaveEvaluationBaseline` 只允許把該 sample 的 pending reservation 完成為正式、不可覆寫的 baseline。
- 一旦任何 fixed cohort 已存在，reserve 操作不得把之後新增的 Test sample 追加進 cohort。
- 若第一次重測途中失敗、重新整理或關閉頁面，pending sample 下次仍包含在 `fixed-test`，可以繼續重試，不會從固定 Test 消失。
- 為相容舊版呼叫，若 SaveEvaluationBaseline 發現尚未有 cohort，backend 會先自動 reserve 當下完整 Test cohort；若該 sample 不在固定 cohort，拒絕追加。

目的：固定 Benchmark cohort 是在『開始第一次測試』時決定，而不是由 OCR 成功與否決定，避免失敗樣本被系統性排除。

### D-078：固定 Benchmark cohort 與動態 Test split 分開看待

`test` split 是 Training Dataset 的防資料洩漏分組；`fixed-test` 則是版本回歸比較的固定 cohort，兩者用途不同。

- `test` 仍會包含 deterministic hash 分到 Test 的一般 Traveler group，以及 D-076 強制留在 Test 的 fixed-baseline Traveler group。
- `fixed-test` 只依 `ocr_evaluation_baselines` membership 讀取，不因之後新增的 Test 樣本而擴張。
- fixed-test 查詢不重新套 `IsUsableTrainingSample` 動態篩選；一旦樣本已被固定，就算未來訓練資料品質條件改變，也應保留在 benchmark 中並顯式失敗，而不是靜默消失。
- OCR 品質頁在 fixed cohort 已存在時，按鈕張數與實際重測樣本都使用 `fixed-test`；只有尚未建立 cohort 前，按鈕暫以當下 `test` 數量顯示預計建立的固定集合大小。
- 新增同一 fixed-Test Traveler 的 Training Sample 可能讓 Dataset 的 Test count 增加，但不會改變固定 benchmark baseline sample count。

目的：Dataset split 解決 Train/Test leakage；Fixed Benchmark 解決版本比較公平性。兩者不能再用同一個『Test 數量』混為一談。

### D-079：團別正式資料使用 per-tour identity / document snapshot

`Traveler` 與 current `DocumentVersion` 是全域目前資料；某一團當時實際使用、人工確認的旅客與證件內容則必須固定在 `tour_member_documents` snapshot。

- 每個 `TourMemberDocument` 保存當次團別連結時的旅客姓名、出生日期、性別、國籍、身分證字號，以及該證件的姓名、證號、簽發國、國籍、有效期限與確認時間。
- 正式 batch review 建立／重新審核 link 時，snapshot 優先使用該 `ScanItem` 人工覆核後的值。
- legacy direct review 沒有 scan item 時，以當下已保存的 Traveler + DocumentVersion 建立 snapshot。
- `GetTour`、團別操作畫面與 CSV 使用 snapshot；後續在「旅客資料」修改全域 Traveler 或 current DocumentVersion，不回頭改寫既有團別。
- 同一旅客有多種證件時，團員層級 identity 由本團 snapshots 聚合：出生日期／性別採最近一次明確 link / re-review；中文姓名、英文姓名、國籍、身分證字號採由新到舊第一個非空值，避免台胞證／身分證沒有英文姓名等欄位時把已確認資料抹空。各證件欄位仍使用各自 link 的 document snapshot。
- 同一團重新審核／重新 link 該證件時，允許明確刷新該 link snapshot。
- Traveler merge 搬移或去重同一本證件 link 時，DocumentVersionId 與整組 snapshot 必須一起保留較新的 link，不得混搭。
- 舊資料 migration 若能找到該團 reviewed scan，優先由 scan 回填 snapshot；只有缺 scan 欄位時才 fallback 到全域 Traveler / DocumentVersion。

目的：全域主檔可以持續修正與換證，但歷史／既有團不能因日後主檔變更而悄悄改變當時已確認的出團資料。

### D-080：Fixed Test 的 Ground Truth 自 cohort reserve 起即凍結

固定 Benchmark 要比較不同 OCR 版本，除了樣本 membership 與 baseline OCR result 不能漂移，評分用的 ground truth 也必須保持同一把尺。

- 一旦 Training Sample 已存在 `ocr_evaluation_baselines` row，不論該 row 仍是 `state = pending` 或已完成第一版 baseline，該 sample 即視為 fixed benchmark artifact。
- fixed sample 的 `ground_truth_json` 不再因 Traveler edit、DocumentVersion edit、Traveler merge、reviewed scan 同步或再次 `selected: true` 而自動刷新。
- 一般沒有進 fixed cohort 的 Train / Validation / Test 樣本仍會隨人工可信資料修正更新 ground truth。
- source ScanItem 與正式 Traveler / DocumentVersion 仍可依法正常修正；fixed Training Sample 是已獨立保存的 benchmark 副本，不必回寫成最新主檔內容。
- 若未來發現 fixed Test 的 ground truth 本身錯誤，不能用一般主檔編輯偷偷修正；應建立明確的 benchmark correction / reset / rebaseline 流程，並讓不同版本比較的基準變更可被辨識。

目的：避免完全沒有修改 OCR pipeline，卻因日後主檔修正而讓 baseline accuracy、current accuracy 或 benchmark history 使用不同答案，造成版本進步／退步失真。

### D-081：自動 Traveler consolidation 也必須先處理 Current DocumentVersion 衝突

D-066 的「同一 Traveler／證件類型只能一筆 current」不只適用人工 merge，也適用 SaveDocumentReview 內因強識別觸發的自動重複 Traveler consolidation。

- 自動 consolidation 搬移 duplicate Traveler 的 DocumentVersion 前，先把 canonical + duplicate 的同類型 current versions 一起比較。
- current 勝出規則維持 VerifiedAt 最新，其次 CreatedAt 最新，再以 DocumentVersionId 穩定排序。
- demotion 必須先 SaveChanges，再搬 traveler_id；避免 PostgreSQL partial unique index 在單一 SQL statement 中看到暫時兩筆 current 而拒絕。
- 多個 duplicate 逐一處理，每次都重新以 canonical 目前 documents + 下一個 duplicate documents reconcile。
- 若後續團別 link merge 或其他 validation 失敗，外層 review transaction 必須 rollback 前面的 demotion 與 document reassignment。

目的：資料庫 unique index 是最後一道保護，不應讓正常的自動重複旅客整理因更新順序而變成 500。

### D-082：團別歷史資料不得因 Traveler / DocumentVersion 刪除而 Cascade 消失

per-tour snapshot 是團別當時已確認的正式資料，因此 Traveler / DocumentVersion 是它的來源參照，不是可向下 cascade 刪除歷史的父資料。

- `tour_members.traveler_id -> travelers.traveler_id` 使用 `ON DELETE RESTRICT`。
- `tour_member_documents.document_version_id -> document_versions.document_version_id` 使用 `ON DELETE RESTRICT`。
- `tour_member_documents -> tour_members` 仍可使用 cascade，因明確刪除整個團員關聯本身就是在移除該團資料。
- 刪除整個 Tour 時既有 `Tour -> TourMember -> TourMemberDocument` cascade 可維持，因那是明確刪除整個團別的語意；目前 V2 未提供一般使用者刪除 Traveler / DocumentVersion 的功能。
- 既有資料庫啟動 migration 會把舊的 cascade FK 換成具名 restrict FK；CI 驗證 PostgreSQL `confdeltype = r`。

目的：未來即使新增資料清理或誤用低階資料庫操作，也不能因刪全域主檔而悄悄抹除既有團別歷史。
### D-083：Reviewed ScanItem（保留既有快照，fallback 規則由 D-084 取代）

> D-083 原先描述的「刪除較新證件後 fallback 至舊掃描」已廢止。審核快照欄位暫保留相容性，不能作為自動更換團別證件的依據。

### D-083：Reviewed ScanItem 保留不可被全域主檔編輯覆寫的審核快照

`scan_items` 在人工審核完成後除了保存目前可同步的 staging 欄位，還要保存一份當次人工確認值的 immutable review snapshot。

- 新增 `scan_items.review_snapshot_json`。
- 每次正式 batch review / re-review 時，用當下人工確認後的姓名、出生日期、性別、國籍、身分證字號與證件欄位重建 snapshot。
- 一般 Traveler / current DocumentVersion 編輯仍可同步既有 reviewed scan item 的 staging 欄位，維持 Training Dataset 與主檔修正流程；但不得改寫 `review_snapshot_json`。
- 刪除本團較新的 reviewed scan item，需要 fallback 到同團同人同證件類型較舊 reviewed scan item 時，`TourMemberDocument` snapshot 優先從該舊 scan 的 review snapshot 重建，而不是使用後來被全域主檔同步改寫的 scan staging 值。
- 舊資料 migration 對既有 reviewed scan item 只能以 migration 當下的 scan 欄位 best-effort 建立 snapshot；已在過去被改寫且沒有歷史來源的值無法事後推回原始人工確認內容。
- 這個 snapshot 與 D-079 的 `tour_member_documents` snapshot 目的不同：前者保存「這筆 scan 當時人工確認了什麼」，後者保存「這個團目前採用／當時確認的正式團別資料」。

目的：避免「先修改全域 Traveler → 再刪除較新的證件 → fallback 到舊 scan」時，把舊團資料意外換成後來修改過的全域身份內容。

### D-084：已審核證件不可直接刪除，也不可自動 fallback

正式證件版本、團別收件紀錄與掃描暫存是不同資料責任：

- 新護照建立新的 `DocumentVersion`，舊護照保留為 historical，不因換證而覆寫。
- 各團 `TourMemberDocument` 保留當次指定證件與獨立 snapshot。全域 Traveler 編輯不得改寫舊團歷史。
- 一般 `DELETE /api/scan-items/{id}` 只允許刪除 PENDING。已 REVIEWED 一律拒絕；不得連帶刪掉 training sample 或團別正式紀錄。
- 前端只對 PENDING 顯示刪除按鈕。已審核資料仍可透過既有審核編輯流程修正一般欄位。
- 既有 `ReconcileTourDocumentLink` 依掃描時間選擇舊 scan 的 fallback 取消。必要的身份修正，只能解除**確定由該次舊 review 產生且尚未被其他 review 改寫**的舊團別關聯；不能替換成任何較舊證件。
- 若無法確定哪一筆 review 擁有團別關聯，先保留，不猜測。不因修正當前主檔，自動消除其他歷史資料。
- 未來如需撤銷誤審核、誤歸人或更正已使用的正式團別證件，必須建立可追溯的明確更正流程，不透過一般刪除或 fallback 假裝修復。
- 這是結構化歷史資料政策，不改變 production 證件照片「回國日 + 7 天」的清除期限。

本決策取代 D-051 與 D-083 涉及「自動 fallback 舊掃描」的規則，不改動已存在的審核快照資料。

### D-085：護照中文姓名以受限官方拼音候選優先作人工審核建議（待 Validation 實測）

- 因 19 張護照 Validation 的 12 張姓名錯誤中，有 7 張已辨出完整姓名，但被羅馬拼音衝突阻擋；官方拼音 shadow 潛在改善 6 張、退步 0，仍只是裁切近似對照。
- 正式保留 `compareChineseNameToMrzRomanization()` 的原核准判斷；新 `guardedOfficialNameSuggestion()` 只在既有選擇器**無法選出**姓名時，對有幾何／標籤資格、有效 MRZ、官方別名全字吻合、信心達 0.78 且唯一的候選提供人工審核建議。不得把「單一音節不符」通通放行。
- 不變更已審核正式記錄，也不自動批准掃描資料；若有疑義保持待人工修正。
- 此決策目前屬首次實作，實際效能與準確率仍需 Validation 實測和跨旅客樣本確認；若有誤選可回滾候選建議，不影響已存之舊審核資料。

### D-086：台胞證姓名及性別採用可核對的證據優先序（待本機驗收）

- 繼承既有人工審核與 MRZ 信任策略。若含中文姓名的 OCR 位置旁**確實有拉丁姓名**且拼音交叉驗證衝突，不得單靠「姓名」文字標籤繞過；若是頁面**其他區域**的無關英文文字造成誤擋，且標籤姓名分數達 0.82，可恢復為待審核欄位建議。
- MRZ 的 requiredValid 為 true 時，性別優先取 MRZ。當 MRZ 未驗證且正面「性別」標籤與語意文字相符、標籤 OCR 分數 >=0.80，才改採正面性別；否則延用既有順序。所有結果仍人工確認。
- GBK MRZ 解碼中文姓名若不符合現有姓名格式則不採用，改由文字區候選提供，避免亂碼蓋掉有效姓名。
- 此為受限 OCR 欄位候選選擇，不更改團別已審核資料或歷史，不觸發證件 fallback。開發中須先通過合成測試和 CI，真實辨識率需另外以 Validation 驗證。

### D-087：台胞證可對低信心且非空白姓名做受限雙裁切覆核（待實測）

- 2026.10.11.2 Validation 與前版持平：中文姓名 6/13、性別 10/13、整張 5/13。PR #19 已通過 CI，但真實 Legacy 回歸未見淨改善。
- 對姓名非空白但 confidence <0.90、且沒有 validated MRZ 中文姓名背書者，可以在同次現有 9 秒軟預算內做姓名局部 OCR 重試。
- 只有**兩個裁切視角都出現相同新姓名**、新分數 >=0.86、confidence >=0.92、現有 confidence <0.88，才允許變動**待人工審核的 OCR 預填建議**；已驗證 MRZ 背書的姓名與強信心選擇器輸出不可被覆蓋。
- 若證據不足或時間不足，不做變更；所有資料仍需人工審核；不得更動主檔、歷史證件或透過 fallback 回填。需 CI + 本機 Validation 確認實際效果及速度，不能憑合成測試推論。

### D-088：台胞證 MRZ 檢查碼有效不代表姓名／性別已通過驗證（待本機驗收）

- `taiwanPermitMrz.ts` 中 MRZ requiredValid **不包含**性別字元 line1[22] 與 GBK 中文姓名區 line2[0..15] 的直接完整性驗證。不得將 requiredValid 當作二者的欄位層 checksum success。
- 性別仍優先 MRZ，唯正面標籤與 row semantic 一致、score >=0.90 時可選不同的視覺性別；否則不覆蓋。使用同一組 OCR 結果解析的兩個資訊源**不是統計獨立的雙模型驗證**，需要人工審核。
- 姓名以強相符的正面標籤與拼音 row 候選（score >=0.88）才覆蓋衝突的 MRZ GBK 名；未有確證仍可對低信心姓名做受限局部 OCR 重試，但不憑任意新文字變更姓名。
- 這只修改待人工審核 OCR 建議，不能修改正式旅客主檔、舊證件獨立歷史紀錄、fixed Test baseline 或照片保留規則。需先通過 CI，僅用新 Validation 實測後確認是否應採用。

## 2026-10-12 — 保守相鄰漢字框候選恢復（待真實 Validation）
- 假設：部分護照中文姓名可能已被 PP-OCRv5 Mobile 辨為相鄰獨立漢字框，但正式姓名 selector 僅處理單個文字框；原有同行 raw-row 診斷不會成為 selector 候選。這是新候選產生路徑，不是重試先前失敗的 VIZ 裁切、放寬拼音或更換插值。
- 在 `chooseTaiwanChineseName()` 新增只限原本 `best` 不存在或低於原門檻的受限兩框拼接 fallback：每框 1–2 個漢字、score >= .82、水平接近且同行、鄰近「姓名」或 MRZ 對應拉丁姓名錨點，整個合併姓名必須使用原本嚴格 `compareChineseNameToMrzRomanization` 得到 `compatible`；多個不同合格合併結果則不使用。原既有成功候選不被覆蓋。
- 不變更台胞證、身分證或任何背景 OCR 模型；正式版本號維持 `2026.10.11.29` 以避免聲稱已提高準確率。新增 `test-passport-joined-han-name.mjs` 並接入 `verify:ocr` 靜態防回歸。
- 注意：此假設**尚無證據證實**四張失敗護照有相鄰完整漢字框。沒有新一輪 32 張 Windows 真實 Validation，也未完成本地 npm build / regression，不得把這批視為已驗證改善；先測編譯，再評估是否真實救回且沒有其他欄位退步。禁止 GitHub Actions 與個資提交。

### D-089：暫停會產生錯選的 PP-OCRv6 自動姓名救援（2026-10-16）
- 決策：保留 PP-OCRv5 Mobile / pipeline .29 正式主線。PP-OCRv6 Small 僅作離線候選研究，不允許直接改寫護照中文姓名，也不能因固定 Validation 達標而放寬嚴格 selector。原有人工審核不變。
- 證據：正式 19 張護照 14/19、13 張台胞證 13/13；四張 .29 缺候選護照中 v6 多辨出一張完整中文姓名，但無錨點候選方法四張有一對三錯；使用當次 .29 MRZ + 正式 nameRomanization.ts 比對，缺候選四張 0 對、2 錯。此實驗不能證明可安全救援。
- 淘汰：PP-OCRv5 Server（無明確救援且極慢）、Tesseract chi_tra（0 救援）、歷史 OCR 英文 + pypinyin 整串比對（0 救援且錯選）、標籤-only 閘門（所有樣本無候選）。來源與限制參照 docs/OCR_CURRENT_STRATEGY.md。
- 下一步：先定位五張姓名錯誤的 Detection、Recognition、候選組裝、selector 與人工答案問題；先做匿名分類及獨立 Test，再引入新的模型或規則。無完整回歸不得升級正式版本。
- 回滾／門檻：候選發生任何無法解釋的錯選，不得進正式自動接受；台胞證 13/13 不能退步。需要實測才宣稱 15/19 或 100%。

### D-090：OCR 模型與決策證據必須集中保存（2026-10-16）
- 新增 docs/OCR_CURRENT_STRATEGY.md 作為現行優先入口；所有改動應記錄假設、模型取捨、所用樣本與執行 backend、候選前後正確率及錯選數、資源耗時、隱私風險、實驗／正式狀態、驗收與回滾。詳細運作寫 WORKLOG，實驗計畫寫 OCR_MODEL_AB_PLAN，交接更新 NEXT_CHAT_HANDOFF。
- 未有原始可驗證指標就標記『待測』，不可把候選存在率視為最終護照成功率。固定 Validation 與獨立 Test 分開；不得上傳私人影像、MRZ 或樣本識別碼，不執行 GitHub Actions。

### D-091：失敗護照先以匿名多區域證據診斷（2026-10-16）
- 正式 .29 5 張護照姓名失敗以既有 name-field / viz-crop / focused-viz 的 exact / other / none / not-run 診斷彙整。增加一段當次 Validation 統計，不顯示姓名、證號、圖片或單張識別碼；結果僅留頁面記憶體。
- 分類可能重疊；這是文字是否出現在 OCR 行／候選裡的觀察，不能直接推論 detector、recognizer 或 ground truth 已確認錯誤。維持原本人工覆核流程；任何改進須另做完整 Validation 與獨立 Test。
- 本項僅改善診斷，未改模型、正式版本、資料庫、台胞證辨識；待 Windows Build 和正式 Validation 驗收。因資料安全禁止向 GitHub 上傳失敗樣本或實際姓名。

### D-092：護照姓名辨識空值必須明示人工審核（2026-10-16）
- 批次掃描保留原先待審核資料寫入，對護照 OCR 的 nameZh 空白在檔案結果列標示「中文姓名未辨出，請人工核對」。不從 MRZ 推造中文字、不放寬拼音相容門檻、不將 v6 錯選候選寫入資料庫。
- 這是風險提示，**不能改善 OCR 的 14/19 原始正確率**。只處理空白姓名；辨錯但非空白的姓名仍須人工確認，不能宣稱提示能涵蓋全部 5 張失敗。
- 台胞證、身分證、DB 結構、固定 Test 不變。待本機 frontend Build 驗證。真正的精準度改進需更多代表性、有權使用的姓名影像與可靠辨識模型之獨立回歸。

### D-093：護照單字框三連接只作嚴格 MRZ fallback（2026-10-16）
- 問題：目前 .29 已有兩框拼接 fallback，但若 PP-OCRv5 將三字姓名拆成三個相鄰單字框便無法經這條路徑恢復。
- 選擇：只在原本 direct selector 沒有 >=0.65 合格結果時，容許三個獨立單一漢字框組合。每框 confidence >=0.88、同列中心差 <=0.35 字高、水平間距 -0.05 至 1.1 字高、鄰近姓名標籤或 MRZ 對應拉丁姓名框，且整串中文姓名經正式 compareChineseNameToMrzRomanization() 回傳 compatible；兩框及三框若有多個不同候選則不採用，已選對的直接候選不能被覆寫。
- 排除：不使用 v6 no-anchor 會錯選的方案、不放行單音節拼音衝突、不使用人工 ground truth 決定候選。不寫入私人影像或 Test。
- 風險／驗收：未知失敗四張是否確有三字拆框；本修改是待驗證假設，**不得宣稱護照已由 14/19 上升**。先本機 build / 靜態測試，之後集中完整 32 張 Validation，任何台胞證退步或錯選即回滾。正式 pipeline 版本暫不變。

### D-094：姓名失敗先以逐字 OCR 覆蓋證據決定後續模型研發（2026-10-16）
- 現有文字裁切比較只判定整串候選是否完整，無法回答四張缺候選樣本是否每個中文字已分散被辨出。正式 Validation 新增匿名 raw OCR 姓名漢字覆蓋分桶（全部／部分／零），只在護照最終姓名錯誤時統計。
- 實作只暫時使用 ground truth 計算回歸覆蓋率，顯示匿名件數，不保存候選文字、真實姓名或圖片，不參與 production selector，不改任何旅客寫入。當姓名含重複漢字，集合式存在檢查可能高估覆蓋；所有字也可能散落非姓名區，這不是保證姓名可由框組合，更不能當作 Detection/Recognition 根因定論。
- 下一步門檻：若四張主要為全部字元存在，優先研究框定位與序列組字；若主要為部分／零字元，優先檢查影像品質與繁體中文 recognizer。尚待 Windows 編譯與正式 32 張 Validation；不得聲稱改善 14/19。

### D-095：三文字框恢復支援 3–4 字姓名，維持既有安全閘門（2026-10-16）
- 查核發現既有三框 fallback 限定每框單一漢字，四字姓名拆成 1+1+2 或 2+1+1 時無法恢復。放寬為每框 1–2 漢字，但組合後**限 3–4 字**。每框信心 >=0.88、同行緊密幾何、姓名標籤或英文錨點、正式 MRZ 全名逐音節 compatible 與唯一候選等既有限制全保留。
- 僅當正式 direct selector 無合格候選時啟動，不從 v6 錯選候選或標準答案自動挑姓名；不修改台胞證、國民身分證或資料庫。
- 目前未證實五張失敗護照具有這種拆框，這是明確可測的覆蓋範圍修復、不是已驗證準確率提高。需本機 verify:ocr、正式 32 張 Validation、持續監看所有原先正確樣本及台胞證 13/13；沒增益即停止擴大拼接規則。

### D-096：停止三框混合長度及其他無收益 fallback 擴張（2026-10-16）
- 本機最新版 32 張正式 Validation：護照 14/19（74%）、台胞證 13/13（100%）；五張護照中文姓名仍錯。D-095 擴充三框至 1+1+2／2+1+1 沒有任何整張準確率增益。
- 決定：停止繼續調整三框幾何、名稱標籤、拼音及 shadow 規則，保留已存在的安全閘門但不再擴大；下一步投入繁體中文文字 recognizer 與影像品質證據。任何新模型先離線同樣本候選比較（含安全錯選），再考慮瀏覽器整合。
- 限制：固定 Validation 未改善，不能宣稱 100% 或模型改良；新模型必須在未知標準答案時維持零錯誤自動接受，且台胞證不得退步。禁止上傳私有圖檔及 GitHub Actions。

### D-097：PP-OCRv4 繁體中文辨識模型作為新的離線 A/B 對照（2026-10-16）
- 依 RapidOCR 官方模型列表，PP-OCRv4 有獨立 chinese_cht Mobile recognition，可由 RapidOCR v3.10 以 Rec.lang_type=LangRec.CHINESE_CHT、Rec.ocr_version=OCRVersion.PPOCRV4、Rec.model_type=ModelType.MOBILE、ONNXRUNTIME 載入。官方資料：https://rapidai.github.io/RapidOCRDocs/main/model_list/
- 研究目的：同一 PP-OCRv6 Small detector、同一 Validation 19 張護照、同一原始 broad VIZ ROI，只替換 recognition，與既有 v6-small 比較 standalone exact、對 .29 四張缺候選的新增完整候選、blind gate 錯選與每張 ROI 耗時。此比較不是瀏覽器端 end-to-end，也未證明安全選取或可用於正式 .29。
- 改 training/experiments/bench_ppocrv6.py 增加 --rec-model v4-traditional；預設仍是 v6-small，模型首次執行可能自行下載，不能要求使用者提供或上傳護照圖片。只有模型辨識與安全 gate 實測皆明確優於原方案才列入瀏覽器可行性評估。回滾：任何更多錯誤自動候選不准直接上線。正式 PP-OCRv5 Mobile/台胞證維持不變。
- 本批尚未在 Windows 安裝/載入新模型或執行私人 19 張 Validation；不得聲稱準確率有提升。

### D-098：繁體辨識模型實測結果（2026-10-16）
- Windows 實測 19 張護照；實際下載模型 chinese_cht_PP-OCRv3_rec_mobile.onnx，雖然命令參數寫 v4-traditional，不能宣稱使用了 PP-OCRv4 權重。
- 正確完整姓名候選 6/19；在正式 .29 四張缺候選中有 2 張出現完整正確姓名，仍有 1 張盲選錯誤。這是離線候選結果，不是正式辨識率。
- 決定只保留人工審核補救研究，不替換正式 PP-OCRv5，不自動覆寫姓名；正式基準仍為護照 14/19、台胞證 13/13。

### D-099：護照空白姓名時有限度使用原圖細節二次辨識（2026-10-16）
- 問題：批次掃描原圖會縮至最長 2400px 與 450 萬畫素；小字筆畫可能在縮圖時受損。此方法與第二辨識模型研究獨立，不能宣稱已證明縮圖導致目前五張 Validation 失敗。
- 決策：只有護照、第一次 nameZh 空白、確曾縮圖、原始 MRZ 有證號、原圖 <= 1200 萬畫素且最長邊 <= 4200px，才再用原圖跑一次正式既有 PP-OCRv5。只接受第二次已產生非空中文姓名，且 MRZ 證號、生日、姓氏、名字均與第一次相同；整份結果替換，避免混合兩次不同解析欄位。異常時保留第一次。儲存真正採用的 OCR input 並留 attempted/accepted 記錄。
- 正式已辨出姓名不重跑；台胞證、身分證不變；會增加失敗護照的本機推論時間，需量測。此法不放寬 selector、不能救出錯但非空白姓名，也不保證二次 OCR 正確。尚待 Windows build、端到端掃描驗收及新的真實樣本，現行 Validation 基準不變。
- 回滾：若出現跨證件接受、影像容量問題、延遲不可接受或新的姓名錯選，撤銷此選用策略。先不將此路線宣稱為 100% 準確率突破。

### D-100：原圖補救採納時保證 MRZ 與輸入證據一致（2026-10-16）
- D-099 原圖重試已通過使用者 Windows Docker 前端建置，但尚未證實提高護照姓名辨識率。
- 補強二次採納條件：除證號、生日、英文姓氏／名字外，也要求性別、國籍、簽發國、效期完全一致。只有姓名非空且全部相等才採用；失敗沿用第一次，避免跨次 OCR 欄位漂移。
- 修正 ocrPayloadJson.ocrInput：實際採用原圖時 resized=false，工作寬高應為原圖寬高；否則維持第一次縮圖資訊。儲存圖檔也必須與最終選用 OCR 輸入一致。增加回歸守衛。
- 本次不動模型、台胞證或 DB，不宣稱正式 14/19 的 Validation 已提升。尚待一張實際大圖缺姓名樣本完成端到端驗收；不啟動 Actions 或推送私人證件。

### D-101：批次護照掃描顯示原圖補救是否成功（2026-10-16）
- 決策：僅從已在本機產生的 ocrPayloadJson.sourceDetailRetry 讀取 attempted/accepted 狀態，顯示每張護照補救已採用或未取得可信姓名的人工覆核提示；不能以補救成功當作姓名已確認正確。其他證件不套用；原本的正式姓名 selector 不變。
- 驗收：保留所有已成功的正常提示；原圖補救接受時提示人工覆核；失敗、無法採用或姓名仍空白時維持核對提示。不能因補救而省略人工確認，不能輸出真實姓名、MRZ 或個資至 GitHub。
- 此次屬現有 D-099/D-100 的操作可觀測性改進，不是新的 OCR 模型或辨識率提升；待本機 npm verify:ocr 與實際批次掃描測試。

### D-102：修正台胞證性別回歸測試的舊預期，不修改正式 selector（2026-10-16）
- 使用者執行 npm run verify:ocr 於 test-permit-evidence.mjs:50 失敗，實際 F、測試預期 M。查核 permitFieldEvidence.ts：當同行性別語意為 F、MRZ 為 M 時，採 semantic-row F，即使 label 分數低；另一筆相同情境的舊斷言也錯誤。
- 因該規則已在現行實作內、過去台胞證固定 Validation 13/13，這次只修正兩個陳舊預期 M→F，另加『無同行語意且 label 分數低，仍選 MRZ』的反向保護案例。不修改台胞證 OCR 模型、選取器、資料庫、護照正式流程。
- 注意僅根據程式選擇邏輯校正測試，不等同已驗證全部測試通過。需新電腦 npm.cmd run verify:ocr 跑完完整測試與 build。禁止因測試而放寬 production MRZ/性別策略。

### D-102：台胞證固定 ROI 尺寸排除浮點取整不穩定（2026-10-16）
- Windows npm run verify:ocr 實測在 test-permit-sex-retry.mjs 發生裁切 600×0.34 本應 204px，但浮點誤差 Math.ceil 得 205px，造成測試不穩定；另一次於 test-permit-evidence.mjs 曾觀察到性別期待 M、實際 F，兩項需區別，不能宣稱全回歸已通過。
- 決策：在 permitSexRetry.ts 中針對接近整數的寬高使用 epsilon 容忍取整，對真正小數值仍保留 ceil 行為。增加 1000×600 和 999×601 測試，維持目前固定 ROI 比例、台胞證模型及正式姓名 OCR 路徑不變。
- 尚待使用者本機 verify:ocr 驗證完整回歸；若仍有 test-permit-evidence 性別不穩定需另行排查，不能因一項修正就聲稱全部通過。不得啟動 GitHub Actions。

### D-102：OCR 回歸測試應驗證語意，不依賴舊欄位相鄰順序（2026-10-16）
- 使用者 Windows `npm.cmd run verify:ocr` 已在 `test-passport-crop-diagnostics.mjs` 中失敗：舊 regex 要求 `passportCropDiagnosis` 緊接 `passportExactDecision`，但 D-094 已加入 `passportCharacterCoverage`；這是測試契約過期，不是 OCR 實測失敗。
- 修正該回歸守衛使其明確檢查新增字元覆蓋欄位與分類函式，不降低 OCR 正確率要求、不移除既有測試、不更動正式辨識程式。
- 當前僅確認來源與錯誤訊息；完整 verify:ocr 及 Windows Build 仍待本機重跑。不得宣稱測試已全部通過。


### D-103：PP-OCRv3 繁中第二模型只提供人工覆核候選（2026-10-16）
- 決策：保留 PP-OCRv5 Mobile 為唯一正式自動填值模型；當護照中文姓名不是 strict-compatible 時，才可啟動隔離的繁中第二 recognizer。
- 第二 recognizer 固定為 RapidOCR 私人實驗實際載入的 chinese_cht_PP-OCRv3_rec_mobile.onnx，SHA-256 779656d044ce388045e02ea9244724616194e63928606436cdfc6dc3c9528cc6。不得再把 v4-traditional 參數名稱寫成 PP-OCRv4 權重。
- Browser asset 使用固定 RapidOCR ONNX 加官方 PaddlePaddle chinese_cht_PP-OCRv3_mobile_rec 固定 commit 的 inference.yml，封裝成 PaddleOCR.js custom ustar。正式驗收前這只是假設相容的橋接，不是已驗證模型部署。
- 候選必須通過既有 production compareChineseNameToMrzRomanization 且 compatible 候選唯一；否則不提供 suggestion。
- suggestion 永不直接寫入 result.chineseName、scan item nameZh、旅客主資料或 originalFields。只保存於 ocrPayloadJson.secondaryChineseNameReview，審核畫面需人工按「人工套用候選」後再核對照片。
- 第二模型任何錯誤都不得阻塞主流程；台胞證與身分證不受影響。
- 驗收：先通過 npm verify:ocr 與 Docker/browser runtime；再以有權使用的護照確認 suggestion 顯示、人工套用及不自動覆寫；最後才跑固定 Validation。未取得真實 Validation 前正式數字維持護照 14/19、台胞證 13/13。

### D-104：照片反光／防偽底紋影響辨識的證據式診斷（2026-10-17）
- 四張候選缺失護照的局部截圖呈現光點、水平防偽紋與紅色防偽底圖。先做獨立離線影像 variant 診斷，不直接對正式掃描加濾鏡，也不因人眼可辨就臆斷哪個 OCR 階段失敗。
- 診斷只跑本機 ZIP 與當次 .29 私人索引，不打印任何姓名／識別碼。觀察原圖與三種簡單變體的匿名候選與幾何彙總；不得將四張固定 Validation 困難樣本作為正式調參並在同一批樣本宣稱泛化收益。
- 原有 D-103 與護照 14/19、台胞證 13/13 不變。要決定是否把預處理納入正式流程，須有獨立開發資料和未參與選型的驗收資料，再評估錯選、耗時與對現有正確樣本的回歸。


### D-105：第二模型候選缺失狀態於人工審核呈現（2026-10-17）
- 審核畫面僅顯示 existing OCR payload 的限定枚舉：unavailable、no-compatible-candidate、ambiguous-compatible-candidates、suggested；後者仍以原本按鍵人工套用。
- 不新增 OCR 推論、測試按鈕，不修改正式姓名欄或已審核資料，不影響台胞證。正式 14/19、13/13 不變，Windows 建置及真實掃描仍待驗證。


### D-106：護照中文姓名繁體呈現與原始 OCR 證據分離（2026-10-17）
- 護照正常掃描直接將單一對應的簡體 OCR 字轉為繁體呈現在 nameZh；保留原始 OCR 於 nameZhOnDocument、ocrPayloadJson.originalFields.nameZh，不改原始照片或 PP-OCRv5 辨識模型。
- 繼承既有 convertSimplifiedNameToTraditional 的一對多歧義保守規則；另外在臺灣護照姓名顯示層規範 Unicode 字形 温→溫。這是地區呈現政策，不能替代查看護照上的真實登記字形，人工可修改。
- 第二 PP-OCRv3 候選也先簡轉繁、略過一對多歧義，再經 strict MRZ comparator 與唯一候選門檻，絕不自動寫入正式旅客姓名。
- 本批為後處理／顯示，不可據此聲稱 recognizer 成功率提高。正式 .29 14/19、台胞證 13/13 保持；Windows verify:ocr 與實際照片驗收待執行。


### D-107：既有待審核護照開啟表單時補做繁體正規化（2026-10-17）
- D-106 僅作用在新掃描建立的 nameZh；先前已進資料庫的 PENDING 護照在 TourDetailPage 審核表單初始化時仍直接採 document.nameZh。D-107 在待審核護照表單入口使用既有 convertSimplifiedNameToTraditional 及 温→溫 顯示正規化；已審核資料不變，未儲存前不寫 DB，原 OCR 影像與證據不變。
- 此修正不提升 recognizer 命中率、不替空白姓名猜字，不改台胞證流程。正式 .29 14/19、台胞證 13/13 不變。


### D-108：護照第二模型候選漏失階段匿名計數（2026-10-17）
- 在 D-103 瀏覽器第二 OCR 推論結果上計數：plausible 完整中文候選數、簡繁多義字候選數、實際轉換數、strict MRZ-compatible 候選數。無文字內容／樣本 ID 傳至審核 API；使用既有私人 ocrPayloadJson 持久化後在待審核頁顯示一行數字。
- 此處 candidateCount 已通過前置候選篩選，不代表原始 Detection 框數；不能據此推斷 Detector 缺失原因。不得根據四張固定 Validation 樣本放寬安全門檻；姓名空白仍保持空白。
- 本批只增加候選路徑觀測，不修改 PP-OCRv5、自動填值、台胞證、正式 Validation；需 Windows 建置及真實掃描驗收。正式護照 14/19、台胞證 13/13 不變。


### D-109：第二模型缺失紀錄與未執行明確區分（2026-10-17）
- review-only 狀態在沒有 secondaryChineseNameReview 物件時回傳 legacy-no-record，在 attempted=false 時回傳 not-attempted；不改寫舊 payload，不據此自動重掃或猜測姓名。僅供待審核護照顯示，不影響其他證件與正式 OCR 結果。


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
