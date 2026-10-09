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
