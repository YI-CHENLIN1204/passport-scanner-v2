# Data Model

本文件描述 Passport Scanner V2 **目前實際使用中的資料模型與資料一致性規則**。

正式 persistence 為 ASP.NET Core + Entity Framework Core + PostgreSQL 16。若本文件與較早 PoC 文件衝突，以 `docs/DECISIONS.md` 中較新的已確認決策與目前 schema 為準。

V2 不把電話、訂單、預計人數、出生地、發證地、發證次數等未確認或不屬於 Scanner 的資料硬塞進旅客／證件主檔。

## 關係總覽

```text
tours
  ├── scan_batches
  │     └── scan_items
  │            ├── tour_person_drafts
  │            ├── document_versions (saved_document_version_id, reviewed 後)
  │            └── training_samples
  │                    └── ocr_evaluation_baselines
  │
  └── tour_members
         ├── travelers
         │      └── document_versions
         └── tour_member_documents
                └── document_versions

ocr_benchmark_runs
```

核心概念分成三層：

1. **scan staging**：OCR 後、人工審核前的暫存資料。
2. **formal traveler/document data**：人工審核後可信的 Traveler / DocumentVersion。
3. **tour receipt links**：某一團實際收到並採用哪張正式證件。

不能因 Traveler 全域已有某張證件，就自動視為新團已經收到該證件。

## travelers

用途：跨團共用的「旅客本人」主檔。

目前主要欄位：

- `traveler_id`
- `name_zh`
- `name_en`
- `birth_date`
- `gender`
- `nationality`
- `national_id_number`
- `personal_id_type`
- `personal_id_number`
- `created_at`
- `updated_at`

### 姓名與外國旅客

資料庫中的 `name_zh` 為 required string，但外國旅客沒有中文姓名時使用空字串；只要 `name_en` 存在即可。

台灣身分證、台胞證，以及 nationality / issuing country 為 TWN 的護照仍要求中文姓名。

### national_id_number

`national_id_number` 專門表示台灣國民身分證統一編號：

- nullable。
- 有值時必須通過台灣身分證檢查碼。
- 性別必須為 M / F，且與第 2 碼一致。
- 若 Traveler 有 current `TAIWAN_NATIONAL_ID`，主檔字號必須與該證件號碼一致。

### personal_id_type / personal_id_number

這兩欄是早期資料模型留下的 compatibility 欄位，不再是正式證件真相來源。

正式證件內容、current / historical 狀態一律以 `document_versions` 為準。

保留這兩欄的原因：

- 相容非常早期資料。
- 旅客搜尋仍可作 legacy fallback。
- Traveler merge 後會重新對齊仍為 current 的證件，避免指向 historical 版本。

不可用 PersonalId 欄位反向覆寫 DocumentVersion。

## document_versions

用途：保存同一 Traveler 的護照、台胞證、台灣身分證版本歷程。

目前欄位：

- `document_version_id`
- `traveler_id`
- `document_type`
- `name_zh_on_document`
- `name_en_on_document`
- `document_number`
- `issuing_country`
- `nationality`
- `expiry_date`
- `is_current`
- `verified_at`
- `created_at`

目前沒有保存：

- issue date。
- birth place。
- 發證地／發證機關。
- 補換發次數。
- 曾持證加註。

這些欄位若未來要新增，必須先確認實際業務或分析價值。

### 版本規則

- 同一本證件再次覆核：更新既有 DocumentVersion，不建立重複版本。
- 新證件：建立新 DocumentVersion。
- 舊證件重新掃描：不會偷偷把 historical version 切回 current。
- 同一 Traveler + document type 最多只能有一筆 `is_current = true`。
- PostgreSQL 使用 partial unique index `ux_document_versions_one_current_per_type` 強制 current invariant。
- historical DocumentVersion 在一般 Traveler edit 中唯讀。
- 團別可以繼續引用 historical DocumentVersion，因為「全域目前證件」不等於「某個歷史團當時使用的證件」。

### 同一本證件 identity

正式 persistence 查找既有 DocumentVersion 時：

- Passport：`document_type + document_number + issuing_country`。
- 台胞證／台灣身分證：`document_type + document_number`。

應用層會拒絕把相同證件 identity 靜默掛到另一位 Traveler。

## Traveler identity matching

人物自動比對採保守策略，不以模糊姓名推測。

### 1. 強識別：台灣身分證字號

若有合法 `national_id_number`：

- 優先搜尋相同字號 Traveler。
- 相同合法字號可用來整理歷史重複 Traveler。
- 不同合法字號不得因姓名／生日相同而自動合併。

### 2. 弱識別：姓名 + 出生日期 + 性別

沒有足夠強識別時：

- 有中文姓名：`name_zh + birth_date + gender`。
- 沒有中文姓名的外國旅客：`name_en + birth_date + gender`，且只比對同樣沒有中文姓名的 Traveler。
- 只在唯一命中時自動使用。
- 命中多位時回傳 ambiguous conflict，不猜其中一位。

Nationality 不再被當成能消除同名歧義的強識別。

### 3. 人工 merge

若同一真人已因歷史 OCR／人工資料形成兩個 Traveler：

- 由操作人員明確指定來源與保留 Traveler。
- 出生日期、性別、兩邊皆有但不同的身分證字號等衝突會阻止 merge。
- DocumentVersion、TourMember、TourMemberDocument、reviewed scan/draft 關聯一起整理。
- 同一團同證件類型若兩邊掛的是不同證件，不替操作人員猜哪一本；先要求處理團別證件衝突。
- merge 全程使用 transaction。

## tours

用途：Scanner 內部的一個團別／出團工作區。

目前欄位：

- `tour_id`
- `tour_name`
- `departure_date`
- `return_date`
- `required_document_types` (PostgreSQL `text[]`)
- `created_at`
- `updated_at`

Scanner 不保存預計人數。

此團需要哪些證件直接由 `required_document_types` 決定，不硬編碼「國旅／出境／大陸團」業務類型。

## tour_members

用途：正式 Traveler 與團別的關聯。

欄位：

- `tour_member_id`
- `tour_id`
- `traveler_id`
- `created_at`

資料庫 unique constraint：

```text
tour_id + traveler_id
```

同一 Traveler 在同一團只能有一筆 TourMember。

## tour_member_documents

用途：表示「這一團實際收到／採用哪個 DocumentVersion」，並固定保存**該團當時人工確認的旅客／證件快照**。

主要欄位：

- `tour_member_document_id`
- `tour_member_id`
- `document_version_id`
- `document_type`
- `snapshot_name_zh`
- `snapshot_name_en`
- `snapshot_birth_date`
- `snapshot_gender`
- `snapshot_nationality`
- `snapshot_national_id_number`
- `snapshot_name_zh_on_document`
- `snapshot_name_en_on_document`
- `snapshot_document_number`
- `snapshot_issuing_country`
- `snapshot_document_nationality`
- `snapshot_expiry_date`
- `snapshot_verified_at`
- `created_at`
- `updated_at`

資料庫 unique constraint：

```text
tour_member_id + document_type
```

規則：

- link 必須指向該 TourMember 所屬 Traveler 的 DocumentVersion。
- Traveler / current DocumentVersion 是全域目前資料；團別畫面與 CSV 使用 per-tour snapshot，不因日後主檔編輯而回寫歷史團資料。
- 正式 batch review 建立／更新 link 時，snapshot 採用該 ScanItem 人工覆核後的值；legacy direct review 沒有 scan item 時，使用當下 Traveler + DocumentVersion。
- 重掃／重新審核是明確的團別操作，可把本團 link 更新到新的 DocumentVersion，並刷新這個 link 的 snapshot。
- 同一旅客有多種證件時，團員層級 identity 以本團 snapshots 逐欄位聚合：出生日期／性別採最近一次 link / re-review；中文姓名、英文姓名、國籍、身分證字號採由新到舊第一個非空值。只要本團已有 snapshot，就不以日後全域 Traveler 的 nullable 欄位回填。每張證件欄位使用各自 link 的 snapshot。
- 從團別移除已審核證件，不刪全域 Traveler / DocumentVersion。
- 若同團同人同類型仍有其他 reviewed scan item，link 回退到最近的剩餘版本，snapshot 也一起回退到該次 reviewed scan。
- Traveler merge 若兩邊其實是同一本證件，較新的 link 必須連同 DocumentVersionId 與整組 snapshot 一起保留，不可混搭。
- 沒有任何正式證件 link 後，空的 TourMember 會移除。

## scan_batches

用途：記錄一次「同一團 + 同一證件類型」的批次掃描執行。

主要欄位：

- `scan_batch_id`
- `tour_id`
- `document_type`
- `status`
- `item_count`
- `attempt_count`
- `failed_count`
- `created_at`
- `updated_at`

狀態：

- `OPEN`：尚未正式完成，可能仍在處理或曾中途離開。
- `COMPLETED`：前端已回報本批 attempt / failed 統計。

`COMPLETED` 後不可再新增 scan item。

## tour_person_drafts

用途：人工審核前的人物暫存群組。

主要欄位：

- `draft_person_id`
- `tour_id`
- `name_zh`
- `birth_date`
- `gender`
- `created_at`
- `updated_at`

Draft grouping 同樣採保守策略：

- 合法 NationalIdNumber 相同是強識別。
- 姓名／英文姓名 + 出生日期 + 性別只在唯一命中一個 draft 時自動掛上。
- 弱條件命中多筆時保持獨立，不 consolidation。
- 已審核 scan item 有 `saved_document_version_id` 後，優先以正式 DocumentVersion → Traveler 關聯判斷，不再依姓名猜。

## scan_items

用途：每張上傳證件在人工覆核前後的 staging / review record。

主要欄位：

- `scan_item_id`
- `scan_batch_id`
- `draft_person_id`
- `document_type`
- `original_file_name`
- `image_content_type`
- `image_bytes`
- `ocr_input_image_content_type`
- `ocr_input_image_bytes`
- `name_zh`
- `name_zh_on_document`
- `name_en`
- `birth_date`
- `gender`
- `nationality`
- `national_id_number`
- `document_number`
- `issuing_country`
- `expiry_date`
- `ocr_payload_json`
- `review_status`
- `saved_document_version_id`
- `reviewed_at`
- `delete_after`
- `created_at`
- `updated_at`

`saved_document_version_id`：

- 人工審核成功後指向正式 DocumentVersion。
- PostgreSQL FK → `document_versions.document_version_id`。
- `ON DELETE SET NULL`，保留 scan history。

### Production photo retention

- production `image_bytes` / OCR input image bytes 只保留到團別回國日後 7 個完整日曆日。
- 到期由 background worker 清除圖片 bytes，不刪 scan row。
- 已過 retention cutoff 的團不得再建立新的 production scan intake。
- PENDING 原圖已刪除後不能完成審核。
- 結構化欄位、正式 Traveler / DocumentVersion 與團別資料繼續保留。

## training_samples

用途：操作人員明確選入、可供未來 OCR 改善的私人 Dataset 副本。

主要欄位：

- `training_sample_id`
- `source_scan_item_id`
- `document_type`
- `image_content_type`
- `image_bytes`
- `ocr_input_image_content_type`
- `ocr_input_image_bytes`
- `ocr_payload_json`
- `ground_truth_json`
- `selected_at`
- `updated_at`

規則：

- 每個 source scan item 最多一筆 training sample。
- `source_scan_item_id` FK → `scan_items.scan_item_id`，`ON DELETE CASCADE`。
- production retention 不刪 scan row，所以不會因 production 圖片到期而刪 training sample。
- Training Dataset 擁有自己的 image / OCR input 副本。
- 只有人工明確選入且完成審核的資料可進 Dataset。
- Train / Validation / Test 必須以 Traveler group 分離，避免同一真人跨 split。
- 固定 Test 不用於反覆調參；OCR 重新開啟條件見 D-072。
- 一旦 sample 被 reserve 進 fixed benchmark cohort（已有 `ocr_evaluation_baselines` row，包含 pending），其 `ground_truth_json` 即凍結，不再隨 Traveler / reviewed scan 的一般同步更新。
- 非 fixed cohort 樣本的 ground truth 仍可隨人工可信資料修正更新。
- fixed ground truth 若確認有誤，必須走未來明確的 benchmark correction / rebaseline 流程，不以一般主檔編輯靜默改寫。

## ocr_evaluation_baselines

用途：固定某個 Training Sample 的 OCR evaluation baseline。

- 主鍵也是 `training_sample_id`。
- FK → `training_samples`，`ON DELETE CASCADE`。
- 保存 `result_json` 與 `captured_at`。

## ocr_benchmark_runs

用途：保存 benchmark run 摘要與 pipeline version，追蹤每次固定 Test 重跑結果。

主要欄位：

- `benchmark_run_id`
- `pipeline_version`
- `sample_count`
- `failed_count`
- `baseline_created_count`
- `summary_json`
- `created_at`

## 人工編輯規則

「旅客資料」允許修正 current Traveler / DocumentVersion，但不能繞過正式 identity validation：

- historical DocumentVersion 唯讀。
- current 台灣身分證存在時，主檔 NationalIdNumber 必須與證件號碼一致。
- 有台灣身分證字號時，性別只能 M / F 且必須符合字號第 2 碼。
- current 台灣身分證、台胞證或 TWN 護照存在時，中文姓名不可清空。
- Traveler birth date 修改後，所有 current documents 都重新驗證，例如 passport / permit expiry 必須晚於出生日期。
- Traveler、current document、reviewed scan/draft、Training ground truth 同步更新採同一 transaction。

## 訂購人／訂單資料

訂購人、手機、訂單、金流、最低出團人數等不屬於目前 Scanner V2 schema。

未來 ERP / 訂單系統若需要：

- 「是否為訂購人」應是訂單關係，不是 OCR 欄位。
- 手機等 contact data 不應為了人物 OCR matching 而加入證件模型。
- Scanner 可透過正式 integration layer 與 ERP 關聯，不在目前 schema 預埋未確認欄位。
